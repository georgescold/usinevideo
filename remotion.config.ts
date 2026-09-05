/**
 * Réglages de rendu communs à toutes les chaînes.
 *
 * Ce qui dépend de la machine ou de la vidéo (concurrence, débit, accélération
 * matérielle) est passé par `pipeline/rends.mjs`, qui lit `.env`. Ici, on ne
 * met que ce qui est vrai partout.
 *
 * Le rendu Remotion produit un **master plat** : ni étalonnage, ni normalisation
 * sonore. Ces deux passes se font ensuite avec le ffmpeg du système, qui est le
 * seul à disposer du filtre `lut3d` et de l'encodeur NVENC.
 */
import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setCodec('h264')

// Explicite, parce qu'en v5 le défaut passera de bt601 à bt709 : autant que le
// master ne change pas de teinte le jour de la mise à jour.
Config.setColorSpace('bt709')

// Les médias vivent dans remotion/public/ : c'est là que le pipeline dépose
// rushes, B-roll, voix et musique.
Config.setPublicDir('remotion/public')

// ANGLE est le backend le plus stable sur GPU dédié Windows, et devient le
// défaut en v5. Il a une fuite mémoire connue sur les rendus très longs :
// `pipeline/rends.mjs` découpe au-delà de 6 000 images.
Config.setChromiumOpenGlRenderer('angle')

// Un rush manquant doit faire échouer le rendu, pas produire un trou noir.
Config.setChromiumIgnoreCertificateErrors(false)
Config.setDelayRenderTimeoutInMilliseconds(120_000)

export {}
