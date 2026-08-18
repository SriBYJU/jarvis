import '../styles/globals.css';
import '../styles/jarvis-v6.css';
import FastMapRuntime from '../components/FastMapRuntime';
import JarvisRuntimeFinal from '../components/JarvisRuntimeFinal';

export default function App({ Component, pageProps }) {
  return <>
    <FastMapRuntime />
    <Component {...pageProps} />
    <JarvisRuntimeFinal />
  </>;
}
