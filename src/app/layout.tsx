import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import SiteNavigation from './site-navigation';
export const metadata: Metadata={title:'RISE OF THE MACHINE | ODUMODUBLVCK',description:'ODUMODUBLVCK live in Abuja, 20 December 2026. KALA GAMES team registration.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><header className="site-header"><div className="wrap header-inner"><Link href="/" className="wordmark" aria-label="Rise of the Machine home"><span className="wordmark-full">Rise of the Machine</span><span className="wordmark-short">ROTM</span></Link><SiteNavigation/></div></header><main id="main-content" tabIndex={-1}>{children}</main><footer className="site-footer"><div className="wrap"><span>ODUMODUBLVCK · Abuja · December 2026</span><span><Link href="/tickets/orders">My tickets</Link> · <Link href="/merch/orders">My merch orders</Link></span></div></footer></body></html>;}
