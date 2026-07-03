function rectangle(length, depth) {
  const halfLength = length / 2;
  const halfDepth = depth / 2;
  return [
    [-halfLength, -halfDepth],
    [halfLength, -halfDepth],
    [halfLength, halfDepth],
    [-halfLength, halfDepth]
  ];
}

export function createFootprint(template, params) {
  if (template === 'bar') {
    return rectangle(params.length, params.depth);
  }

  if (template === 'lShape') {
    const halfLength = params.length / 2;
    const halfDepth = params.depth / 2;
    return [
      [-halfLength, -halfDepth],
      [halfLength, -halfDepth],
      [halfLength, -halfDepth + params.wingDepth],
      [-halfLength + params.wingLength, -halfDepth + params.wingDepth],
      [-halfLength + params.wingLength, halfDepth],
      [-halfLength, halfDepth]
    ];
  }

  if (template === 'courtyard') {
    const halfLength = params.courtyardLength / 2;
    const halfDepth = params.courtyardDepth / 2;
    return {
      outer: rectangle(params.length, params.depth),
      holes: [[
        [-halfLength, -halfDepth],
        [-halfLength, halfDepth],
        [halfLength, halfDepth],
        [halfLength, -halfDepth]
      ]]
    };
  }

  throw new Error(`未知建筑模板：${template}`);
}
