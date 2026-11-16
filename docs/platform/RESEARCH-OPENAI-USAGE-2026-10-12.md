# OpenAI personal usage and institutional AI

Checked: 12 October 2026. Official documentation was searched and opened. No account connection, API call or billing change was performed.

## Confirmed

OpenAI now documents Sign in with ChatGPT with optional use of an eligible person's ChatGPT plan for AI requests. Identity and plan usage are separate permissions. Availability is limited for commercial/private integrations; open source availability does not establish eligibility for Pleadli's paid private distribution. Request the appropriate access before promising this option. [Official quickstart](https://developers.openai.com/siwc/quickstart).

The documented plan usage integration discovers the selected account's models and calls the public Responses API with OAuth credentials. Completed inference and appropriate grants must be verified; login alone is insufficient. This documentation does not establish that the same allowance pays for Realtime or audio transcription endpoints. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

Credentials must stay outside browser storage and logs, with refresh, account switching and revocation handled deliberately. Direct users to ChatGPT usage settings. Do not assume each connected app receives a separate usage allowance. [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).

Realtime transcription is separately documented, including incremental events and contextual language/vocabulary hints. Endpoint/model support must be checked for the chosen implementation and measured on local courtroom speech. A language setting is not evidence of acceptable accuracy. [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription).

## Existing Pleadli seam

`packages/node-core/src/ai.rs` supports provider/key based engines, including OpenAI compatible services. That is useful reuse for existing provider calls, but it is not the ChatGPT OAuth and Responses contract. No working personal ChatGPT plan connection was found in the reviewed code.

## Recommendation

Offer an institution funded gateway, optional personal provider credentials, optional eligible ChatGPT plan connection, and local/institution hosted services under one policy controlled Assist surface. Separate funding permission from permission to send justice records. Personal usage must not bypass an HQ restriction.

Store OAuth tokens in the native credential layer, show the current payer, validate actual grants, use provider specific discovery, and stop visibly on quota failure. Do not silently change payer or data destination. Retain core offline operation without AI. Treat commercial eligibility, allowed endpoints, data processing terms and actual regional account access as pre implementation checks.
