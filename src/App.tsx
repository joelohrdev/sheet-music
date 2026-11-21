import { useEffect, useState } from 'react'
import { KeyMapPage } from './components/KeyMap'
import { Library } from './components/Library'
import { Player } from './components/Player'

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const match = /^#\/piece\/(.+)$/.exec(hash)
  if (hash === '#/keys') return <KeyMapPage />
  return match ? <Player key={match[1]} id={decodeURIComponent(match[1])} /> : <Library />
}
