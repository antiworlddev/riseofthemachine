import type { Metadata } from 'next';
import ReviewDashboard from './review-dashboard';
export const metadata:Metadata={title:'KALA GAMES | Organizer review',robots:{index:false,follow:false}};
export default function ReviewPage(){return <section className="registration-page"><p className="eyebrow">ORGANIZER ACCESS</p><h1>KALA GAMES<span className="red">.</span></h1><p className="intro">Review team rosters.</p><p><a href="/admin/kala-games/settings">Manage teams, sports and registration</a></p><p><a href="/staff/check-in">Staff ticket check-in</a></p><p><a href="/admin/tickets">Concert ticket operations</a></p><ReviewDashboard/></section>;}
