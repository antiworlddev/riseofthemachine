import type { Metadata } from 'next';
import ReviewDashboard from './review-dashboard';
export const metadata:Metadata={title:'KALA GAMES | Organizer review',robots:{index:false,follow:false}};
export default function ReviewPage(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">ORGANIZER ACCESS</p><h1>KALA GAMES<span className="red">.</span></h1><p className="intro">Review team rosters.</p><ReviewDashboard/></section></div>;}
