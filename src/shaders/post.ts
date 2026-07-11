export const copyVertexShader = /* glsl */ `
out vec2 screenUv;

void main() {
  screenUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Linear-space running average: with temporalMix = n/(n+1) the history converges to
// the true mean of the jittered samples, which is what makes the paused image
// supersample toward a converged still.
export const accumulateFragmentShader = /* glsl */ `
precision highp float;

in vec2 screenUv;
out vec4 outputColor;

uniform sampler2D radianceTexture;
uniform sampler2D historyTexture;
uniform float temporalMix;

void main() {
  vec3 radiance = texture(radianceTexture, screenUv).rgb;
  vec3 history = texture(historyTexture, screenUv).rgb;
  outputColor = vec4(mix(radiance, history, temporalMix), 1.0);
}
`;

export const compositeFragmentShader = /* glsl */ `
precision highp float;

in vec2 screenUv;
out vec4 outputColor;

uniform sampler2D accumulatedTexture;
uniform vec2 resolution;
uniform float exposure;
uniform float bloomStrength;

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 bloom(vec2 uv) {
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int i = 0; i < 9; i += 1) {
    vec2 tap = vec2(float(i % 3) - 1.0, float(i / 3) - 1.0);
    vec3 sampleColor = texture(accumulatedTexture, uv + tap * 2.0 / resolution).rgb;
    float bright = max(max(sampleColor.r, sampleColor.g), sampleColor.b);
    float w = exp(-0.42 * dot(tap, tap)) * smoothstep(0.9, 5.0, bright);
    sum += sampleColor * w;
    weight += w;
  }
  return sum / max(weight, 1.0e-4);
}

void main() {
  vec3 radiance = texture(accumulatedTexture, screenUv).rgb;
  radiance += bloom(screenUv) * bloomStrength;
  vec3 mapped = aces(radiance * exposure);
  outputColor = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
}
`;
