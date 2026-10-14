'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
export default function SiteNavigation(){const path=usePathname();return <nav aria-label="Main navigation">{[['/','The Show'],['/tickets','Tickets'],['/merch','Merch'],['/kala-games','KALA Games']].map(([href,label])=><Link key={href} href={href} aria-current={(href==='/'?path===href:path.startsWith(href))?'page':undefined} className={href==='/tickets'?'nav-cta':undefined}>{label}</Link>)}</nav>;}
