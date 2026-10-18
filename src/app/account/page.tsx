import Profile from './profile';
export const metadata={title:'Account setup | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Team access</p><h1>Account setup.</h1><p>Save your verified profile before an organizer grants staff access. Saving a profile does not grant access or register a team.</p><Profile/></section></div>;}
