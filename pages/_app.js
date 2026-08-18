import '../styles/globals.css';
import '../styles/jarvis-v4.css';
import JarvisExperienceV4 from '../components/JarvisExperienceV4';

export default function App({ Component, pageProps }) {
  return <>
    <Component {...pageProps} />
    <JarvisExperienceV4 />
  </>;
}
