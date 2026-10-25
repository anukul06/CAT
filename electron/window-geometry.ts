export type Rect={x:number;y:number;width:number;height:number};
export function fitWindow(bounds:Rect,area:Rect,expanded:boolean):Rect{
 const width=Math.min(expanded?432:152,area.width);const height=Math.min(expanded?760:154,area.height);
 return {x:Math.round(Math.max(area.x,Math.min(bounds.x+bounds.width-width,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(bounds.y+bounds.height-height,area.y+area.height-height))),width,height};
}
