type View = 'home' | 'settings' | 'sessions'

export default function useFocusOnNavigate(setView: (v: View) => void) {
  return (v: View) => {
    setView(v)
    // focus the heading after the view updates
    requestAnimationFrame(() => {
      const id = v === 'home' ? 'home-heading' : v === 'settings' ? 'settings-title' : 'sessions-heading'
      const el = document.getElementById(id)
      if (el) (el as HTMLElement).focus()
    })
  }
}
