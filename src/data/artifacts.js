import theKiss from './artifacts/the-kiss.json'

// Add one JSON file per object here as the collection grows.
export const artifacts = [theKiss]
export const artifactsById = Object.fromEntries(artifacts.map((artifact) => [artifact.id, artifact]))
