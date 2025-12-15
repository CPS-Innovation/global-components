function observeIsMaterials(handler) {
  if (!window.__isMaterialsObserver) {
    const hasIsMaterials = (url) => {
      const params = new URL(url).searchParams
      return params.get("IsMaterials") === "true"
    }

    window.__isMaterialsObserver = {
      handler: null,
      previousState: hasIsMaterials(location.href),
    }

    window.navigation.addEventListener("navigatesuccess", () => {
      const observer = window.__isMaterialsObserver
      const currentState = hasIsMaterials(location.href)

      if (currentState !== observer.previousState) {
        observer.handler?.(currentState)
        observer.previousState = currentState
      }
    })
  }

  window.__isMaterialsObserver.handler = handler
}
