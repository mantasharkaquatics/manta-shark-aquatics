import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, weld, simplify, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.45, error: 0.0006 }), resample(), prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(process.argv[3], doc);
