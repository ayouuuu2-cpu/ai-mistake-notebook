import { PROMPT_VERSION } from '../server/diagnosis-service.js'

export default function handler(_req, res) {
  res.status(200).json({ ok: true, promptVersion: PROMPT_VERSION })
}
