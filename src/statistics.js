// 原笔记：应用线性回归，第 1 章，例 1.1；12 名学生的身高和体重。
// No observations are added, removed, jittered or rescaled independently.
export const students = [
  [171,58.5],[175,65],[159,38],[155.3,45],[152,35],[158.3,44.5],
  [154.8,44.5],[164,51],[165.2,55],[164.5,46],[159.1,48],[164.2,46.5],
].map(([height,weight],i)=>({id:i+1,height,weight}));
const mean = values => values.reduce((s,v)=>s+v,0)/values.length;
const xs=students.map(p=>p.height),ys=students.map(p=>p.weight);
const mx=mean(xs),my=mean(ys);
const ssx=xs.reduce((s,x)=>s+(x-mx)**2,0),ssy=ys.reduce((s,y)=>s+(y-my)**2,0);
const cross=students.reduce((s,p)=>s+(p.height-mx)*(p.weight-my),0);
export const example = {
  n:students.length,meanHeight:mx,meanWeight:my,
  slope:cross/ssx,intercept:my-cross/ssx*mx,correlation:cross/Math.sqrt(ssx*ssy),
  heightSD:Math.sqrt(ssx/(students.length-1)),weightSD:Math.sqrt(ssy/(students.length-1)),
};
export const standardized = students.map(p=>({id:p.id,x:(p.height-mx)/example.heightSD,y:(p.weight-my)/example.weightSD}));
export const sigmoid = eta => 1/(1+Math.exp(-eta));
export const residualSum = slope => students.reduce((s,p)=>s+(p.weight-(my+slope*(p.height-mx)))**2,0);
