//! Hiding names from an online model.
//!
//! When Assist runs on a model the office does not host, the names, national
//! ID numbers and phone numbers of the people on a file are swapped for
//! stand-ins ("Accused A", "Witness 2", "ID 1") in the text that leaves this
//! computer, and swapped back in the answer. The model still sees the facts and
//! who did what, not who the people are.
//!
//! Limits, stated plainly on the settings screen too: only typed text is
//! covered. A scanned paper is sent as an image and any name written in it goes
//! with it. A name that is spelled differently from the record, or is only
//! described ("the man from Gulu"), is not caught. A model on this computer
//! sees everything and needs none of this.

use serde_json::Value;
use sqlx::SqlitePool;

#[derive(Debug, Default, Clone)]
pub struct Aliases {
    /// (what is on the file, the stand-in), longest first so "Okello John" goes before "Okello".
    out: Vec<(String, String)>,
    /// (the stand-in, what it stands for in the answer).
    back: Vec<(String, String)>,
}

fn replace_ci(text: &str, needle: &str, with: &str) -> String {
    if needle.is_empty() {
        return text.to_string();
    }
    // ASCII-only lowercasing keeps byte offsets identical, so indices into the copy are valid in the original.
    let hay = text.to_ascii_lowercase();
    let n = needle.to_ascii_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut at = 0;
    while let Some(found) = hay[at..].find(&n) {
        let start = at + found;
        let end = start + n.len();
        // A whole word only: "Ann" must not be taken out of "Annet" or "channel".
        let before = text[..start].chars().next_back();
        let after = text[end..].chars().next();
        let inside = before.is_some_and(|c| c.is_alphanumeric()) || after.is_some_and(|c| c.is_alphanumeric());
        out.push_str(&text[at..start]);
        out.push_str(if inside { &text[start..end] } else { with });
        at = end;
    }
    out.push_str(&text[at..]);
    out
}

impl Aliases {
    /// Nothing is hidden.
    pub fn none() -> Self {
        Self::default()
    }

    pub fn is_none(&self) -> bool {
        self.out.is_empty()
    }

    /// Builds the stand-ins for the people on one file, in a fixed order so the same person has the same stand-in
    /// all through one conversation.
    pub async fn for_file(pool: &SqlitePool, file_id: &str) -> Result<Self, sqlx::Error> {
        let rows: Vec<(String, String, String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT fp.role, p.first_name, p.last_name, p.other_names, p.national_id, p.phone
               FROM prosecution_file_people fp JOIN people p ON p.id = fp.person_id
              WHERE fp.prosecution_file_id = ? ORDER BY fp.role, fp.created_at, p.id",
        )
        .bind(file_id)
        .fetch_all(pool)
        .await?;
        Ok(Self::from_people(rows))
    }

    fn from_people(rows: Vec<(String, String, String, Option<String>, Option<String>, Option<String>)>) -> Self {
        let mut a = Self::default();
        let mut counts = std::collections::HashMap::<String, usize>::new();
        let mut ids = 0;
        let mut phones = 0;
        for (role, first, last, other, national_id, phone) in rows {
            let (first, last) = (first.trim().to_string(), last.trim().to_string());
            let word = match role.as_str() {
                "accused" => "Accused",
                "complainant" => "Complainant",
                "witness" => "Witness",
                "victim" => "Victim",
                _ => "Person",
            };
            let n = counts.entry(word.to_string()).or_insert(0);
            *n += 1;
            // Accused are lettered, everyone else numbered, the way the papers refer to them.
            let alias = if word == "Accused" { format!("Accused {}", (b'A' + ((*n - 1) % 26) as u8) as char) } else { format!("{word} {n}") };
            let full = format!("{first} {last}");
            let mut names = vec![full.clone(), format!("{last}, {first}"), format!("{last} {first}")];
            names.extend([first.clone(), last.clone()].into_iter().filter(|x| x.chars().count() >= 3));
            if let Some(o) = other.as_deref() {
                names.extend(o.split(',').map(str::trim).filter(|x| x.chars().count() >= 3).map(str::to_string));
            }
            for name in names.into_iter().filter(|x| !x.trim().is_empty()) {
                a.out.push((name, alias.clone()));
            }
            a.back.push((alias, full));
            if let Some(id) = national_id.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
                ids += 1;
                a.out.push((id.to_string(), format!("ID {ids}")));
            }
            if let Some(ph) = phone.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
                phones += 1;
                a.out.push((ph.to_string(), format!("PHONE {phones}")));
            }
        }
        a.out.sort_by_key(|(real, _)| std::cmp::Reverse(real.len()));
        a.out.dedup_by(|x, y| x.0.eq_ignore_ascii_case(&y.0));
        a.back.sort_by_key(|(alias, _)| std::cmp::Reverse(alias.len()));
        a
    }

    /// The text as the model may see it.
    pub fn hide(&self, text: &str) -> String {
        self.out.iter().fold(text.to_string(), |t, (real, alias)| replace_ci(&t, real, alias))
    }

    /// The model's answer with the stand-ins turned back into the people they stand for.
    pub fn show(&self, text: &str) -> String {
        let mut t = text.to_string();
        for (alias, real) in &self.back {
            t = replace_ci(&t, alias, real);
        }
        // National ID and phone stand-ins are restored too, in the same pass.
        for (real, alias) in self.out.iter().filter(|(_, a)| a.starts_with("ID ") || a.starts_with("PHONE ")) {
            t = replace_ci(&t, alias, real);
        }
        t
    }

    pub fn show_value(&self, v: &mut Value) {
        match v {
            Value::String(s) => *s = self.show(s),
            Value::Array(items) => items.iter_mut().for_each(|i| self.show_value(i)),
            Value::Object(map) => map.values_mut().for_each(|i| self.show_value(i)),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Aliases {
        Aliases::from_people(vec![
            ("accused".into(), "John".into(), "Okello".into(), Some("Johnny".into()), Some("CM91034521XYZAB".into()), Some("0772 445 108".into())),
            ("witness".into(), "Grace".into(), "Namutebi".into(), None, None, None),
        ])
    }

    #[test]
    fn names_ids_and_phones_are_hidden_in_every_order_and_case() {
        let a = sample();
        let out = a.hide("Okello, John (CM91034521XYZAB, 0772 445 108) was seen by GRACE Namutebi. Okello fled; Johnny hid.");
        assert!(!out.to_lowercase().contains("okello") && !out.contains("Grace") && !out.contains("CM91") && !out.contains("0772"), "{out}");
        assert!(out.contains("Accused A") && out.contains("Witness 1") && out.contains("ID 1") && out.contains("PHONE 1"), "{out}");
    }

    #[test]
    fn a_name_inside_another_word_is_left_alone() {
        let a = Aliases::from_people(vec![("witness".into(), "Ann".into(), "Lule".into(), None, None, None)]);
        assert_eq!(a.hide("Annet met Ann on the channel."), "Annet met Witness 1 on the channel.");
    }

    #[test]
    fn the_answer_gets_the_real_names_back_and_the_same_person_keeps_one_stand_in() {
        let a = sample();
        let sent = a.hide("Okello took the phone. Grace Namutebi saw it.");
        let mut answer = serde_json::json!({ "summary": "Witness 1 saw Accused A.", "list": ["ID 1 is the accused's number"] });
        a.show_value(&mut answer);
        assert_eq!(answer["summary"], "Grace Namutebi saw John Okello.");
        assert_eq!(answer["list"][0], "CM91034521XYZAB is the accused's number");
        assert!(sent.contains("Accused A took") && sent.contains("Witness 1 saw"));
    }

    #[test]
    fn a_file_with_no_people_hides_nothing() {
        let a = Aliases::from_people(vec![]);
        assert!(a.is_none());
        assert_eq!(a.hide("Nothing to hide here."), "Nothing to hide here.");
    }
}
