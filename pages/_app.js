import '../styles/globals.css';
import '../styles/jarvis-core.css';
import JarvisCoreOverlay from '../components/JarvisCoreOverlay';
import SpotifyCommandBridge from '../components/SpotifyCommandBridge';

export default function App({ Component, pageProps }) {
  return <>
    <Component {...pageProps} />
    <JarvisCoreOverlay />
    <SpotifyCommandBridge />
  </>;
}
