//! Renders a document's content into the files a prosecutor takes away.
//! Markdown and DOCX are exports: the stored content stays the source of truth.
//! PDF is the print path (the window's print dialog), not generated here.

use docx_rs::{AlignmentType, Docx, Footer, Paragraph, Run};

use super::document_content::Block;
use super::documents::Document;

fn status_line(doc: &Document) -> String {
    match (&doc.status[..], &doc.reference) {
        ("issued", Some(reference)) => reference.clone(),
        _ => "DRAFT, not issued".to_string(),
    }
}

/// A file name that is safe on every system.
pub fn file_name(doc: &Document, extension: &str) -> String {
    let base = doc.reference.clone().unwrap_or_else(|| format!("{}-draft", doc.kind));
    let safe: String = base.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect();
    format!("{safe}.{extension}")
}

pub fn markdown(doc: &Document) -> String {
    let mut out = String::new();
    out.push_str(&format!("_{}_\n\n# {}\n\n", doc.content.office, doc.content.title));
    out.push_str(&format!("**{}**\n\n", status_line(doc)));
    for block in &doc.content.blocks {
        match block {
            Block::Heading { text } => out.push_str(&format!("## {text}\n\n")),
            Block::Paragraph { text } => out.push_str(&format!("{text}\n\n")),
            Block::Note { text } => out.push_str(&format!("> {text}\n\n")),
            Block::Fields { rows } => {
                for row in rows {
                    out.push_str(&format!("- **{}:** {}\n", row.label, row.value));
                }
                out.push('\n');
            }
            Block::List { ordered, items } => {
                for (i, item) in items.iter().enumerate() {
                    let marker = if *ordered { format!("{}.", i + 1) } else { "-".to_string() };
                    match &item.title {
                        Some(title) => out.push_str(&format!("{marker} **{title}.** {}\n", item.text)),
                        None => out.push_str(&format!("{marker} {}\n", item.text)),
                    }
                }
                out.push('\n');
            }
            Block::Signature { label, name, caption } => {
                if !label.is_empty() {
                    out.push_str(&format!("{label}:\n\n"));
                }
                out.push_str("______________________________\n\n");
                out.push_str(&format!("{}{}\n\n", name, caption.as_ref().map(|c| if name.is_empty() { c.clone() } else { format!(" ({c})") }).unwrap_or_default()));
            }
        }
    }
    if let Some(sha) = &doc.content_sha256 {
        out.push_str(&format!("---\nSHA-256 of the issued content: `{sha}`\n"));
    }
    out
}

pub fn docx(doc: &Document) -> Result<Vec<u8>, String> {
    let text = |t: &str| Run::new().add_text(t);
    let mut d = Docx::new();

    d = d.add_paragraph(Paragraph::new().align(AlignmentType::Center).add_run(text(&doc.content.office.to_uppercase()).size(18)));
    d = d.add_paragraph(Paragraph::new().align(AlignmentType::Center).add_run(text(&doc.content.title.to_uppercase()).bold().size(26)));
    d = d.add_paragraph(Paragraph::new().align(AlignmentType::Center).add_run(text(&status_line(doc)).size(18)));
    d = d.add_paragraph(Paragraph::new());

    for block in &doc.content.blocks {
        match block {
            Block::Heading { text: t } => d = d.add_paragraph(Paragraph::new().add_run(text(t).bold().size(22))),
            Block::Paragraph { text: t } => d = d.add_paragraph(Paragraph::new().add_run(text(t).size(22))),
            Block::Note { text: t } => d = d.add_paragraph(Paragraph::new().add_run(text(t).italic().size(20))),
            Block::Fields { rows } => {
                for row in rows {
                    d = d.add_paragraph(Paragraph::new().add_run(text(&format!("{}: ", row.label)).bold().size(20)).add_run(text(&row.value).size(20)));
                }
                d = d.add_paragraph(Paragraph::new());
            }
            Block::List { ordered, items } => {
                for (i, item) in items.iter().enumerate() {
                    let marker = if *ordered { format!("{}. ", i + 1) } else { "\u{2022} ".to_string() };
                    let mut p = Paragraph::new().indent(Some(360), None, None, None).add_run(text(&marker).size(22));
                    if let Some(title) = &item.title {
                        p = p.add_run(text(&format!("{title}. ")).bold().size(22));
                    }
                    d = d.add_paragraph(p.add_run(text(&item.text).size(22)));
                }
                d = d.add_paragraph(Paragraph::new());
            }
            Block::Signature { label, name, caption } => {
                d = d.add_paragraph(Paragraph::new());
                if !label.is_empty() {
                    d = d.add_paragraph(Paragraph::new().add_run(text(&format!("{label}:")).size(20)));
                }
                d = d.add_paragraph(Paragraph::new().add_run(text("______________________________").size(20)));
                let line = match (name.is_empty(), caption) {
                    (false, Some(c)) => format!("{name} ({c})"),
                    (false, None) => name.clone(),
                    (true, Some(c)) => c.clone(),
                    (true, None) => String::new(),
                };
                d = d.add_paragraph(Paragraph::new().add_run(text(&line).size(20)));
            }
        }
    }

    d = d.footer(Footer::new().add_paragraph(Paragraph::new().align(AlignmentType::Center).add_run(text(&format!("{}  |  {}", doc.content.office, status_line(doc))).size(16))));

    let mut buffer = std::io::Cursor::new(Vec::new());
    d.build().pack(&mut buffer).map_err(|e| e.to_string())?;
    Ok(buffer.into_inner())
}
