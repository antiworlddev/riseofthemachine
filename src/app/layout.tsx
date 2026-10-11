import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata={title:'RISE OF THE MACHINE | ODUMODUBLVCK',description:'ODUMODUBLVCK live in Abuja, 20 December 2026. KALA GAMES team registration.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><header className="site-header"><Link href="/" className="wordmark">RISE OF THE MACHINE</Link><nav aria-label="Main navigation"><Link href="/">The show</Link><Link href="/tickets">Tickets</Link><Link href="/kala-games">KALA GAMES</Link></nav></header><main>{children}</main><footer>ODUMODUBLVCK · ABUJA · DECEMBER 2026</footer></body></html>;}
