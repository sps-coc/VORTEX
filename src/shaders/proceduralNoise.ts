export const proceduralNoiseChunk = /* glsl */ `
float hash31(vec3 seed) {
  return fract(sin(dot(seed, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float valueNoise(vec3 samplePoint) {
  vec3 cell = floor(samplePoint);
  vec3 offset = fract(samplePoint);
  offset = offset * offset * (3.0 - 2.0 * offset);
  float n000 = hash31(cell + vec3(0, 0, 0));
  float n100 = hash31(cell + vec3(1, 0, 0));
  float n010 = hash31(cell + vec3(0, 1, 0));
  float n110 = hash31(cell + vec3(1, 1, 0));
  float n001 = hash31(cell + vec3(0, 0, 1));
  float n101 = hash31(cell + vec3(1, 0, 1));
  float n011 = hash31(cell + vec3(0, 1, 1));
  float n111 = hash31(cell + vec3(1, 1, 1));
  float nx00 = mix(n000, n100, offset.x);
  float nx10 = mix(n010, n110, offset.x);
  float nx01 = mix(n001, n101, offset.x);
  float nx11 = mix(n011, n111, offset.x);
  return mix(mix(nx00, nx10, offset.y), mix(nx01, nx11, offset.y), offset.z);
}

float fractalNoise(vec3 samplePoint) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave += 1) {
    total += amplitude * valueNoise(samplePoint);
    samplePoint = samplePoint * 2.03 + vec3(17.1, 3.7, 9.2);
    amplitude *= 0.5;
  }
  return total;
}
`;
