/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Technologies from './components/Technologies';
import Services from './components/Services';
import Portfolio from './components/Portfolio';
import About from './components/About';
import Process from './components/Process';
import Contact from './components/Contact';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="relative min-h-screen selection:bg-primary/30 selection:text-white">
      <div
        className="pointer-events-none fixed inset-0 -z-10 page-grid opacity-[0.18]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-linear-to-b from-[#3b82f6]/12 via-transparent to-transparent opacity-90"
        aria-hidden
      />
      <Navbar />
      <main>
        <Hero />
        <Technologies />
        <Services />
        <Portfolio />
        <About />
        <Process />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
