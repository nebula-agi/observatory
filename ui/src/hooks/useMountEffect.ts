import { useEffect } from "react"

export function useMountEffect(effect: () => void | (() => void)): void {
  /* eslint-disable no-restricted-syntax */
  useEffect(effect, [])
}
