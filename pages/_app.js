import { useRouter } from 'next/router';
import '../styles/globals.css';
import '../styles/jarvis-v4.css';
import '../styles/jarvis-v5.css';
import FastMapRuntime from '../components/FastMapRuntime';
import JarvisShellV5 from '../components/JarvisShellV5';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  if (router.pathname === '/') {
    return <>
      <FastMapRuntime />
      <JarvisShellV5 />
    </>;
  }
  return <Component {...pageProps} />;
}
