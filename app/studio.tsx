"use client";
import {Component, useEffect, useState} from "react";
class StudioBoundary extends Component<any,{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main className="startup-state" role="alert"><h1>Let’s reopen your studio.</h1><p>The studio hit an unexpected problem. Your saved books remain available.</p><button className="btn" onClick={()=>window.location.reload()}>Reload studio</button></main>:this.props.children;}
}
export default function Studio() {
 const [App,setApp]=useState<any>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{import("../src/main.jsx").then(m=>setApp(()=>m.default)).catch(()=>setFailed(true));},[]);
 return App ? <StudioBoundary><App/></StudioBoundary> : <main className="startup-state" aria-live="polite"><h1>Folio Book Studio</h1><p>{failed?'The studio could not load. Check your connection and try again.':'Opening your personal press…'}</p>{failed&&<button className="btn" onClick={()=>window.location.reload()}>Try again</button>}</main>;
}
