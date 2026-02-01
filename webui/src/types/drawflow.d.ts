declare module 'drawflow' {
    export default class Drawflow {
        constructor(container: HTMLElement);
        start(): void;
        clear(): void;
        addNode(
            name: string,
            inputs: number,
            outputs: number,
            posx: number,
            posy: number,
            classOverride: string,
            data: any,
            html: string,
            typenode?: boolean
        ): number;
        removeNodeId(id: string): void;
        getNodeFromId(id: number | string): any;
        export(): any;
        import(data: any): void;
        on(event: string, callback: (...args: any[]) => void): void;
        removeListener(event: string, callback: (...args: any[]) => void): void;
        zoom: number;
        zoom_max: number;
        zoom_min: number;
        zoom_value: number;
        zoom_refresh(): void;
        reroute: boolean;
        precanvas: HTMLElement;
        container: HTMLElement;
    }
}
