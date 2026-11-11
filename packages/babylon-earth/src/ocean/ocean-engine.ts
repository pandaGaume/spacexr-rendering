import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { GpuTerrainEngine, type ITerrainEngine, type ITerrainEngineInputs } from "@spacexr/3d-tiles-babylon";
import type {IEcefSpatialState,ITileActivationContext,ITilePresentationContext,ITileDeactivationContext,IMetadataStore,IRuntimeContent} from "@spacexr/3d-tiles-runtime";
import {fresnelNormal,regionIncludingOcean,validateOceanMask,validateOceanReference,type IOceanReference,type IOceanMask} from "@spacexr/ocean";
import {atmosphereCamera} from "../atmosphere/camera";
import {oceanShader} from "./generated/surface";

type Activation=ITileActivationContext<IEcefSpatialState,unknown,never>;
type Presentation=ITilePresentationContext<IEcefSpatialState,unknown,never>;
/** Owner-approved opaque P1 composition. Mask values are linear coverage; no DEM sign classifies water. */
export interface IEarthOceanOptions {
    reference:IOceanReference;
    mask:IOceanMask;
    refractiveIndexAir:number;
    refractiveIndexWater:number;
}
/** A companion surface driven exclusively by the existing terrain cut and resource lifecycle. No runtime or render pass. */
export class OceanTerrainEngine implements ITerrainEngine {
    public readonly name="terrain-and-ocean";
    public readonly water:GpuTerrainEngine;
    private readonly handles=new Map<unknown,unknown>();
    private readonly texture:RawTexture;
    public constructor(private readonly terrain:ITerrainEngine,private readonly scene:Scene,inputs:ITerrainEngineInputs,cells:number,
        private readonly options:IEarthOceanOptions,private readonly metadata:()=>IMetadataStore) {
        validateOceanReference(options.reference);validateOceanMask(options.mask);
        if(options.reference.heightMeters!==0)throw new RangeError("P1 supports only the explicitly approved render-zero level.");
        this.water=new GpuTerrainEngine({...inputs,elevation:undefined,imageryPages:undefined,normalPages:undefined},{cells});
        const m=this.water.material,path=m.shaderPath;
        if(typeof path!=="object"||!path.vertexSource)throw new Error("Ocean requires the existing GPU terrain shader source.");
        const varying="varying vOceanUv:vec2f;\nvarying vOceanClip:vec4f;\n";
        const vertex=path.vertexSource.replace("#define CUSTOM_VERTEX_MAIN_END",`
            let span=vertexInputs.instRotation.z/(2.0*3.141592653589793);
            let centerU=atan2(vertexInputs.instRotation.y,vertexInputs.instRotation.x)/(2.0*3.141592653589793)+0.5;
            vertexOutputs.vOceanUv=vec2f(centerU+(uv.x-0.5)*span,0.5-vertexInputs.instSurface.x/(2.0*3.141592653589793)+(uv.y-0.5)*span);
            vertexOutputs.vOceanClip=vertexOutputs.position;
            #define CUSTOM_VERTEX_MAIN_END
        `);
        m.shaderPath={...path,vertexSource:varying.replaceAll("\\n","\n")+vertex,fragmentSource:oceanShader};
        m.options.uniforms.push("oceanForward","oceanRight","oceanUp","oceanF0");m.options.samplers.push("oceanMask");
        this.texture=RawTexture.CreateRTexture(options.mask.data,options.mask.width,options.mask.height,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
        this.texture.gammaSpace=false;this.texture.wrapU=Texture.WRAP_ADDRESSMODE;this.texture.wrapV=Texture.CLAMP_ADDRESSMODE;
        m.setTexture("oceanMask",this.texture);m.setFloat("oceanF0",fresnelNormal(options.refractiveIndexAir,options.refractiveIndexWater));
        m.markDirty(true);
    }
    private resource(context:Activation,content:IRuntimeContent<unknown>,handle:unknown):Presentation {
        return{runtimeId:context.runtimeId,tile:context.tile,resources:[{content,handle,metadataHandle:content.metadataHandle}],tileMetadataHandle:context.tile.metadataHandle,metadataStore:this.metadata()};
    }
    public async activate(context:Activation):Promise<void> {
        for(const content of context.pendingContents){
            let waterHandle:unknown;
            await this.water.activate({...context,pendingContents:[content],readiness:{...context.readiness,ready:async(_id,resource)=>{
                if(resource.kind==="renderable")waterHandle=resource.handle;return true;
            }}});
            let retained=false;
            try{
                await this.terrain.activate({...context,pendingContents:[content],readiness:{...context.readiness,ready:async(id,resource)=>{
                    if(resource.kind!=="renderable")return context.readiness.ready(id,resource);
                    const volume=resource.tileBoundingVolume;
                    const accepted=await context.readiness.ready(id,{...resource,tileBoundingVolume:()=>{
                        const current=typeof volume==="function"?volume():volume??context.tile.source.boundingVolume;
                        return current.region?{...current,region:regionIncludingOcean(current.region,this.options.reference)}:current;
                    }});
                    if(accepted&&waterHandle!==undefined){this.handles.set(resource.handle,waterHandle);retained=true;}
                    return accepted;
                }}});
            }finally{if(!retained&&waterHandle!==undefined)this.water.release(this.resource(context,content,waterHandle));}
        }
    }
    private waterContext(context:Presentation):Presentation {
        return{...context,resources:context.resources.filter(resource=>this.handles.has(resource.handle)).map(resource=>({...resource,handle:this.handles.get(resource.handle)}))};
    }
    public deactivate(context:ITileDeactivationContext<IEcefSpatialState,unknown,never>):void {this.terrain.deactivate(context);this.water.deactivate(context);}
    public present(context:Presentation):void {this.terrain.present(context);this.water.present(this.waterContext(context));}
    public hide(context:Presentation):void {this.terrain.hide(context);this.water.hide(this.waterContext(context));}
    public release(context:Presentation):void {this.water.release(this.waterContext(context));this.terrain.release?.(context);for(const resource of context.resources)this.handles.delete(resource.handle);}
    public beforeRender():void {
        this.terrain.beforeRender();this.water.beforeRender();const camera=this.scene.activeCamera;if(!camera)return;
        const frame=atmosphereCamera(camera,this.scene.getEngine().getRenderWidth(),this.scene.getEngine().getRenderHeight());
        this.water.material.setVector4("oceanForward",new Vector4(...frame.forwardEcef,0));
        this.water.material.setVector4("oceanRight",new Vector4(...frame.rightEcef,frame.halfWidthTangent));
        this.water.material.setVector4("oceanUp",new Vector4(...frame.upEcef,frame.halfHeightTangent));
    }
    public afterRender():void {this.terrain.afterRender();this.water.afterRender();}
    public getStatistics(){const a=this.terrain.getStatistics(),b=this.water.getStatistics();return{handles:a.handles+b.handles,presented:a.presented+b.presented,created:a.created+b.created,released:a.released+b.released,cpuBytes:a.cpuBytes+b.cpuBytes,gpuBytes:a.gpuBytes+b.gpuBytes};}
    public setVerticalScale(value:number):void {this.terrain.setVerticalScale(value);}
    public dispose():void {this.handles.clear();this.water.dispose();this.texture.dispose();this.terrain.dispose();}
}
