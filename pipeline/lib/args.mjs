/**
 * args.mjs — lecture des arguments de ligne de commande.
 *
 * Convention unique dans toute la stack : `--cle=valeur`, `--drapeau`,
 * et le reste en positionnel. `--aide` est reconnu partout.
 */

export function litArgs(argv = process.argv.slice(2)) {
  const options = {}
  const positionnels = []
  for (const brut of argv) {
    if (brut.startsWith('--')) {
      const [cle, ...reste] = brut.slice(2).split('=')
      options[cle] = reste.length ? reste.join('=') : true
    } else {
      positionnels.push(brut)
    }
  }
  return { options, positionnels }
}

export const drapeau = (options, nom) =>
  options[nom] === true || options[nom] === 'true' || options[nom] === '1'

export function nombre(options, nom, defaut) {
  const v = options[nom]
  if (v === undefined || v === true) return defaut
  const n = Number(v)
  return Number.isFinite(n) ? n : defaut
}

/** Affiche l'aide et sort, si `--aide` est présent. */
export function aide(options, texte) {
  if (drapeau(options, 'aide') || drapeau(options, 'help')) {
    console.log(texte.trim() + '\n')
    process.exit(0)
  }
}

/** Enveloppe un point d'entrée : erreurs lisibles, code de sortie correct. */
export async function principal(travail) {
  try {
    await travail()
  } catch (e) {
    console.error(`\n[31m✗[0m ${e.message}\n`)
    if (process.env.DEBUG) console.error(e.stack)
    process.exit(1)
  }
}
