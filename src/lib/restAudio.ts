let audio: AudioContext | null = null
/** Llamar desde un gesto del usuario (pulsar un esfuerzo): los navegadores solo dejan sonar tras una interacción. */
export function unlockAudio() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch { /* sin WebAudio: solo vibración y color */ }
}
export function beep(freq: number, ms: number, delayMs = 0) {
  if (!audio || audio.state !== 'running') return
  const t0 = audio.currentTime + delayMs / 1000
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000)
  osc.connect(gain).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + ms / 1000 + 0.02)
}
