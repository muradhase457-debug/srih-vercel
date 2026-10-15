// Running clock inside the picture (shows the phone's time, second hand ticks)
(function(){
  const hh=document.getElementById("ckh"),mh=document.getElementById("ckm"),sh=document.getElementById("cks"); if(!hh) return;
  let sAcc=null,last=-1;
  function tick(){
    const d=new Date(),s=d.getSeconds(),m=d.getMinutes(),h=d.getHours()%12;
    if(sAcc===null) sAcc=s*6; else if(s!==last) sAcc+=((s-last+60)%60)*6;
    last=s;
    sh.style.rotate=(sAcc+180)+"deg";
    mh.style.rotate=(m*6+s*.1+180)+"deg";
    hh.style.rotate=(h*30+m*.5+180)+"deg";
  }
  tick(); setInterval(tick,1000);
})();
