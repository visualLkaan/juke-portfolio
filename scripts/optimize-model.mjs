// Builds public/models/juke-opt.glb from models-src/juke.glb:
// base colour stays 2048px (it carries the visible detail), the normal and
// metallic-roughness maps go down to 1024px; all WebP, geometry Draco-compressed.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, prune, textureCompress, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

const doc = await io.read('models-src/juke.glb')
await doc.transform(
  dedup(),
  weld(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, resize: [2048, 2048], quality: 92 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(normal|metallicRoughness)/, resize: [1024, 1024], quality: 90 }),
  draco(),
)
await io.write('public/models/juke-opt.glb', doc)
