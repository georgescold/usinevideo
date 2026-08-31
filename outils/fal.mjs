/**
 * Outil fal.ai : solde, decouverte de modeles, generation d images.
 *
 *   node outils/fal.mjs solde
 *   node outils/fal.mjs modeles                 sonde les identifiants candidats
 *   node outils/fal.mjs image "<prompt>" [--modele=id] [--sortie=chemin.jpg] [--taille=landscape_16_9]
 *
 * La cle vit dans config/keys.json, jamais en clair ailleurs. Elle n est jamais
 * affichee, meme partiellement.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

function cle() {
  const t = JSON.parse(readFileSync('config/keys.json', 'utf8'))
  const k = (t.fal ?? []).find((x) => x.enabled !== false)
  if (!k) throw new Error('Aucune cle fal active dans config/keys.json')
  return k.key
}

const AUTH = () => ({ Authorization: `Key ${cle()}` })

async function solde() {
  const candidats = [
    'https://rest.alpha.fal.ai/billing/user_balance',
    'https://rest.alpha.fal.ai/billing/balance',
    'https://api.fal.ai/billing/user_balance',
  ]
  for (const url of candidats) {
    try {
      const r = await fetch(url, { headers: AUTH() })
      const txt = await r.text()
      console.log(`${r.status}  ${url}`)
      if (r.ok) {
        console.log('   ', txt.slice(0, 300))
        return
      }
      if (r.status !== 404) console.log('   ', txt.slice(0, 200))
    } catch (e) {
      console.log(`ERR   ${url} : ${e.message}`)
    }
  }
}

// Sonde l existence d un modele sans le facturer : on envoie une requete
// volontairement invalide et on lit le code de retour.
// 422 = le modele existe et valide les entrees. 404 = il n existe pas.
async function sonde(id) {
  try {
    const r = await fetch(`https://fal.run/${id}`, {
      method: 'POST',
      headers: { ...AUTH(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const txt = await r.text()
    let verdict = `${r.status}`
    if (r.status === 422) verdict += ' EXISTE (entrees invalides, ce qui est attendu)'
    else if (r.status === 404) verdict += ' inexistant'
    else if (r.ok) verdict += ' EXISTE et a repondu'
    else verdict += ' ' + txt.slice(0, 120).replace(/\s+/g, ' ')
    return { id, verdict }
  } catch (e) {
    return { id, verdict: 'ERR ' + e.message }
  }
}

async function modeles() {
  const candidats = [
    'fal-ai/flux/schnell',
    'fal-ai/flux/dev',
    'fal-ai/flux-2',
    'fal-ai/flux-2-dev',
    'fal-ai/flux-2/dev',
    'fal-ai/flux-2-turbo',
    'fal-ai/flux-2/turbo',
    'fal-ai/flux-2-dev-turbo',
    'fal-ai/flux-2-flex',
    'fal-ai/flux-2-pro',
    'fal-ai/flux-2-klein',
    'fal-ai/flux-pro/v1.1',
  ]
  const res = await Promise.all(candidats.map(sonde))
  for (const r of res) console.log(r.verdict.padEnd(52), r.id)
}

async function image(prompt, opts) {
  const modele = opts.modele ?? 'fal-ai/flux/schnell'
  const sortie = opts.sortie ?? 'assets/miniatures/test-fal.jpg'
  const taille = opts.taille ?? 'landscape_16_9'

  const corps = { prompt, image_size: taille, num_images: 1 }
  if (modele.includes('schnell')) corps.num_inference_steps = 4

  console.log(`Modele  : ${modele}`)
  console.log(`Taille  : ${taille}`)
  console.log(`Prompt  : ${prompt.slice(0, 110)}...`)

  const t0 = Date.now()
  const r = await fetch(`https://fal.run/${modele}`, {
    method: 'POST',
    headers: { ...AUTH(), 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const txt = await r.text()
  if (!r.ok) {
    console.error(`\n✗ ${r.status}\n${txt.slice(0, 600)}`)
    process.exit(1)
  }
  const data = JSON.parse(txt)
  const url = data.images?.[0]?.url
  if (!url) {
    console.error('\n✗ Pas d image dans la reponse :\n' + txt.slice(0, 400))
    process.exit(1)
  }

  const bin = Buffer.from(await (await fetch(url)).arrayBuffer())
  mkdirSync(dirname(sortie), { recursive: true })
  writeFileSync(sortie, bin)

  console.log(`\n✓ ${sortie}  ·  ${Math.round(bin.length / 1024)} ko  ·  ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  if (data.timings) console.log('  timings :', JSON.stringify(data.timings))
}

const [cmd, ...reste] = process.argv.slice(2)
const positionnels = reste.filter((a) => !a.startsWith('--'))
const opts = Object.fromEntries(
  reste.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('='))
)

if (cmd === 'solde') await solde()
else if (cmd === 'modeles') await modeles()
else if (cmd === 'image') await image(positionnels[0], opts)
else console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0])
