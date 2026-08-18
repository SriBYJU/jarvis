import '../styles/globals.css';
import '../styles/jarvis-v6.css';
import FastMapRuntime from '../components/FastMapRuntime';
import JarvisRuntimeV6 from '../components/JarvisRuntimeV6';

export default function App({ Component, pageProps }) {
  return <>
    <FastMapRuntime />
    <Component {...pageProps} />
    <JarvisRuntimeV6 />
  </>;
}
