import { IPlugin, IModLoaderAPI, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
import { IOOTCore, OotEvents, Age } from 'modloader64_api/OOT/OOTAPI';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { Z64OnlineEvents, Z64Online_LocalModelChangeProcessEvt } from './OoTOAPI';
import { number_ref, bool_ref } from 'modloader64_api/Sylvain/ImGui';
import { guRTSF, guMtxF2L } from './MatrixHelper';
import { onViUpdate } from 'modloader64_api/PluginLifecycle';

const GAMEPLAY_KEEP_PTR: number = 0x8016A66C;
const GK_BOOMER1 = 0xC698;
// const GK_BOOMER2 = 0xC808;
const LUT_DL_BOOMERANG = 0x51B0;

interface IMatrixRef {
    t_x: number_ref,
    t_y: number_ref,
    t_z: number_ref,
    r_x: number_ref,
    r_y: number_ref,
    r_z: number_ref,
    s_x: number_ref,
    s_y: number_ref,
    s_z: number_ref
}
class ok_boomerang implements IPlugin {

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;
    @InjectCore()
    core!: IOOTCore;
    heapPtr!: number;
    boomerMtx: IMatrixRef = {
        r_x: [0],
        r_y: [0],
        r_z: [0],
        t_x: [0],
        t_y: [0],
        t_z: [0],
        s_x: [1],
        s_y: [1],
        s_z: [1]
    }
    windowOpen = [false];
    window2Open = [false];
    wasPaused = false;
    lastEvt!: Z64Online_LocalModelChangeProcessEvt;
    shouldReplace = [true];

    preinit(): void {
    }
    init(): void {
    }
    postinit(): void {
    }
    onTick(frame?: number | undefined): void {
        if (this.core.helper.isPaused()) {
            if (!this.wasPaused) {
                this.wasPaused = true;
            }
        } else if (this.wasPaused) {
            this.ModLoader.utils.setTimeoutFrames(() => { this.updatePtrs(this.lastEvt) }, 20);
            this.wasPaused = false;
        }
    }

    @EventHandler(EventsClient.ON_HEAP_READY)
    allocMemory() {
        this.heapPtr = this.ModLoader.heap!.malloc(0x60);

        let displayList = Buffer.alloc(0x20);

        displayList.writeUInt32BE(0xDA380000);
        displayList.writeUInt32BE(this.heapPtr, 4);
        displayList.writeUInt32BE(0xDE000000, 8);
        displayList.writeUInt32BE(0xD8380002, 16);
        displayList.writeUInt32BE(0x00000040, 20);
        displayList.writeUInt32BE(0xDF000000, 24);
        displayList.writeUInt32BE(0x00000000, 28);

        this.ModLoader.emulator.rdramWriteBuffer(this.heapPtr + 0x40, displayList);

        this.updateMatrix();

        this.ModLoader.logger.debug("Boomerang heap shenanigans located at 0x" + this.heapPtr.toString(16));
    }

    @EventHandler(ModLoaderEvents.ON_SOFT_RESET_PRE)
    onSoftResetPre() {
        this.ModLoader.heap!.free(this.heapPtr);
    }

    @EventHandler(ModLoaderEvents.ON_SOFT_RESET_POST)
    onSoftResetPost() {
        this.allocMemory();
    }

    @EventHandler(Z64OnlineEvents.LOCAL_MODEL_CHANGE_FINISHED)
    updatePtrs(evt: Z64Online_LocalModelChangeProcessEvt) {
        let linkObj = this.doesLinkObjExist(Age.CHILD);

        this.lastEvt = evt;

        this.ModLoader.utils.setTimeoutFrames(() => {
            if (linkObj.exists) {
                this.ModLoader.emulator.rdramWrite32(this.heapPtr + 0x40 + 0xC, linkObj.pointer + LUT_DL_BOOMERANG);

                this.ModLoader.logger.debug("Found Link object at 0x" + linkObj.pointer.toString(16));
            } else { // fallback

                if (!evt)
                    return;

                this.ModLoader.emulator.rdramWrite32(this.heapPtr + 0x40 + 0xC, evt.child.pointer + 0x5318);

                this.ModLoader.logger.debug("Link object not found. Fell back to 0x" + evt.child.pointer.toString(16));
            }

            this.replaceBoomer();

        }, 1);
    }

    replaceBoomer() {

        if (!this.shouldReplace[0]) return;

        this.ModLoader.emulator.rdramWritePtr32(GAMEPLAY_KEEP_PTR, GK_BOOMER1, 0xDE010000);
        this.ModLoader.emulator.rdramWritePtr32(GAMEPLAY_KEEP_PTR, GK_BOOMER1 + 4, this.heapPtr + 0x40);
        // this.ModLoader.emulator.rdramWritePtr32(GAMEPLAY_KEEP_PTR, GK_BOOMER2, 0xDE010000);
        // this.ModLoader.emulator.rdramWritePtr32(GAMEPLAY_KEEP_PTR, GK_BOOMER2 + 4, this.heapPtr + 0x40);

        // this.ModLoader.logger.debug("Replaced Boomerangs at 0x" + (GAMEPLAY_KEEP_PTR + GK_BOOMER1).toString(16) + " and 0x" + (GAMEPLAY_KEEP_PTR + GK_BOOMER2).toString(16));
        this.ModLoader.logger.debug("Replaced Boomerang at 0x" + (this.ModLoader.emulator.rdramRead32(GAMEPLAY_KEEP_PTR) + GK_BOOMER1).toString(16));
    }

    updateMatrix() {
        this.ModLoader.emulator.rdramWriteBuffer(this.heapPtr,
            guMtxF2L(guRTSF(this.boomerMtx.r_x[0], this.boomerMtx.r_y[0], this.boomerMtx.r_z[0], this.boomerMtx.t_x[0], this.boomerMtx.t_y[0], this.boomerMtx.t_z[0],
                this.boomerMtx.s_x[0], this.boomerMtx.s_y[0], this.boomerMtx.s_z[0])));
    }

    @onViUpdate()
    menuBar() {
        if (this.ModLoader.ImGui.beginMainMenuBar()) {
            if (this.ModLoader.ImGui.beginMenu("Mods")) {
                if (this.ModLoader.ImGui.beginMenu("ok boomerang")) {

                    if (this.ModLoader.ImGui.menuItem("Open Slider Window")) {
                        this.window2Open[0] = true;
                    }

                    if (this.ModLoader.ImGui.menuItem("Open Direct Window")) {
                        this.windowOpen[0] = true;
                    }

                    this.ModLoader.ImGui.endMenu();
                }

                this.ModLoader.ImGui.endMenu();
            }
            this.ModLoader.ImGui.endMainMenuBar();
        }

        this.advancedMtxWindow(this.boomerMtx, "ok boomerang mtx editor", this.windowOpen);
        
        if (this.window2Open[0]) {
            if (this.ModLoader.ImGui.begin("ok boomerang sliders")) {
                this.setupSliders(this.boomerMtx, "##Boomerang")
            }

            this.replaceCheck();
            this.ModLoader.ImGui.end();
        }
    }

    addSlider(menuItemName: string, sliderID: string, numberRef: number[], min: number, max: number): void {
        //if (this.ModLoader.ImGui.beginMenu(menuItemName)) {
            if (this.ModLoader.ImGui.sliderFloat(menuItemName, numberRef, min, max)) {
                this.ModLoader.utils.setTimeoutFrames(() => {
                    this.updateMatrix();
                }, 1);
            }
            //this.ModLoader.ImGui.endMenu();
        //}
    }

    replaceCheck() {
        if (this.ModLoader.ImGui.checkbox("Replace Boomerang", this.shouldReplace)) {
            this.ModLoader.utils.setTimeoutFrames(() => {
                if (this.shouldReplace[0]) {
                    this.replaceBoomer();
                }
                else {
                    this.restorePtr();
                }
            }, 1);
        }
    }

    restorePtr() {
        this.ModLoader.emulator.rdramWritePtr32(GAMEPLAY_KEEP_PTR, GK_BOOMER1, 0xE7000000);
        this.ModLoader.emulator.rdramWritePtr32(GAMEPLAY_KEEP_PTR, GK_BOOMER1 + 4, 0x00000000);
    }

    setupSliders(mtx: IMatrixRef, sliderID: string) {
        this.addSlider("Rot X", sliderID, mtx.r_x, -360, 360);
        this.addSlider("Rot Y", sliderID, mtx.r_y, -360, 360);
        this.addSlider("Rot Z", sliderID, mtx.r_z, -360, 360);
        this.addSlider("Trans X", sliderID, mtx.t_x, -1000, 1000);
        this.addSlider("Trans Y", sliderID, mtx.t_y, -1000, 1000);
        this.addSlider("Trans Z", sliderID, mtx.t_z, -1000, 1000);
        this.addSlider("Scale X", sliderID, mtx.s_x, -5, 5);
        this.addSlider("Scale Y", sliderID, mtx.s_y, -5, 5);
        this.addSlider("Scale Z", sliderID, mtx.s_z, -5, 5);
    }

    advancedMtxWindow(mtx: IMatrixRef, windowName: string, open: bool_ref) {
        if (open[0]) {
            if (this.ModLoader.ImGui.begin(windowName, open)) {
                if (
                    this.ModLoader.ImGui.inputFloat("X Rotation", mtx.r_x) ||
                    this.ModLoader.ImGui.inputFloat("Y Rotation", mtx.r_y) ||
                    this.ModLoader.ImGui.inputFloat("Z Rotation", mtx.r_z) ||
                    this.ModLoader.ImGui.inputFloat("X Translation", mtx.t_x) ||
                    this.ModLoader.ImGui.inputFloat("Y Translation", mtx.t_y) ||
                    this.ModLoader.ImGui.inputFloat("Z Translation", mtx.t_z) ||
                    this.ModLoader.ImGui.inputFloat("Scale X", mtx.s_x) ||
                    this.ModLoader.ImGui.inputFloat("Scale Y", mtx.s_y) ||
                    this.ModLoader.ImGui.inputFloat("Scale Z", mtx.s_z)
                ) {
                    this.ModLoader.utils.setTimeoutFrames(() => {
                        this.updateMatrix();
                    }, 1);
                }
            }

            this.replaceCheck();

            this.ModLoader.ImGui.end();
        }
    }

    doesLinkObjExist(age: Age) {
        let link_object_pointer: number = 0;
        let obj_list: number = 0x801D9C44;
        let obj_id = age === Age.ADULT ? 0x00140000 : 0x00150000;
        for (let i = 4; i < 0x514; i += 4) {
            let value = this.ModLoader.emulator.rdramRead32(obj_list + i);
            if (value === obj_id) {
                link_object_pointer = obj_list + i + 4;
                break;
            }
        }
        if (link_object_pointer === 0) return { exists: false, pointer: 0 };
        link_object_pointer = this.ModLoader.emulator.rdramRead32(link_object_pointer);
        return { exists: this.ModLoader.emulator.rdramReadBuffer(link_object_pointer + 0x5000, 0xB).toString() === "MODLOADER64", pointer: link_object_pointer };
    }

}

module.exports = ok_boomerang;