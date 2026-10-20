// Short vibrations through the Vibration API. Browsers without it (desktop,
// iOS Safari) ignore the call.
const vibrate = ms => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // no vibration on this platform
  }
}

export const hapticLight = () => vibrate(10)
export const hapticMedium = () => vibrate(20)
export const hapticHeavy = () => vibrate(35)
