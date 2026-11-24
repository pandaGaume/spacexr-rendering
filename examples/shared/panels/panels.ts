import "./panels.css";

/** Options of {@link makeFoldable}. */
export interface IFoldableOptions {
    /** Remembers the folded state in this browser under this key. */
    key: string;
    /** Title element already in the panel, moved into its header. Otherwise a title is created from `title`. */
    header?: HTMLElement;
    /** Title of the header when the panel has none. */
    title?: string;
    /** Folded state when nothing is remembered. Defaults to unfolded. */
    folded?: boolean;
}

function readFolded(key: string): boolean | undefined {
    try {
        const value = window.localStorage.getItem(`sxr-panel:${key}`);
        return value === null ? undefined : value === "1";
    } catch {
        return undefined;
    }
}

function writeFolded(key: string, folded: boolean): void {
    try {
        window.localStorage.setItem(`sxr-panel:${key}`, folded ? "1" : "0");
    } catch {
        // Storage may be blocked: the state then lasts for the page only.
    }
}

/**
 * Adds a header with a fold button to a panel. A folded panel keeps its header only. The state is remembered per
 * browser, so a panel folded once stays folded on the next page load, a place change included.
 */
export function makeFoldable(
    panel: HTMLElement,
    options: IFoldableOptions,
): void {
    const header = document.createElement("div");
    header.className = "sxr-panel__header";
    const title = options.header ?? document.createElement("strong");
    if (!options.header) title.textContent = options.title ?? "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sxr-panel__fold";
    header.append(title, button);
    panel.prepend(header);

    const apply = (folded: boolean): void => {
        panel.classList.toggle("sxr-panel--folded", folded);
        button.textContent = folded ? "+" : "−";
        button.title = folded ? "Unfold the panel" : "Fold the panel";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-expanded", String(!folded));
    };
    let folded = readFolded(options.key) ?? options.folded ?? false;
    apply(folded);
    button.addEventListener("click", () => {
        folded = !folded;
        apply(folded);
        writeFolded(options.key, folded);
    });
}

/** A point of interest of a body, and the view of it. */
export interface IPlace {
    /** Identifier, used by the `place` URL parameter. */
    id: string;
    name: string;
    /** One line shown below the name. */
    description?: string;
    /** Planetocentric latitude, in degrees. */
    latitude: number;
    /** Planetocentric longitude, positive toward the east, in degrees. */
    longitude: number;
    /** Distance from the camera to the place, in metres. */
    radius: number;
    /** Camera inclination, in degrees. */
    pitch: number;
    /** Camera heading, in degrees. Defaults to 0. */
    yaw?: number;
}

/** The place `place` names, or `undefined`. Throws on an unknown name. */
export function findPlace(
    places: readonly IPlace[],
    parameters: URLSearchParams,
): IPlace | undefined {
    const id = parameters.get("place");
    if (id === null) return undefined;
    const place = places.find((candidate) => candidate.id === id);
    if (!place)
        throw new RangeError(
            `place must be one of ${places.map((candidate) => candidate.id).join(", ")}.`,
        );
    return place;
}

/** URL of the page viewing a place. Every other parameter of the page, the dataset and the renderer included, is kept. */
export function placeUrl(place: IPlace, href = window.location.href): string {
    const url = new URL(href);
    for (const name of ["lat", "lon", "radius", "pitch", "yaw"])
        url.searchParams.delete(name);
    url.searchParams.set("place", place.id);
    return url.toString();
}

/** Options of {@link PlacesPanel}. */
export interface IPlacesPanelOptions {
    /** Remembers the folded state of the panel under this key. */
    key: string;
    /** Identifier of the place on screen, if any. */
    current?: string | undefined;
    /** Initial flight speed multiplier. Defaults to 1. */
    speed?: number;
}

/**
 * Panel listing the points of interest of a body, with the speed of the flight to them. Choosing one calls
 * {@link onSelect}, and records the place in the address of the page without reloading it; until the example sets
 * `onSelect`, while it loads, a choice reloads the page on the place.
 */
export class PlacesPanel {
    public readonly element: HTMLElement;
    /** Flight speed multiplier chosen in the panel. */
    public speed: number;
    /** Called with the chosen place and the speed. */
    public onSelect: ((place: IPlace, speed: number) => void) | undefined;
    private readonly buttons = new Map<string, HTMLButtonElement>();

    public constructor(
        container: HTMLElement,
        places: readonly IPlace[],
        options: IPlacesPanelOptions,
    ) {
        this.speed = options.speed ?? 1;
        this.element = document.createElement("nav");
        this.element.className = "sxr-places";
        this.element.setAttribute("aria-label", "Points of interest");
        const list = document.createElement("ul");
        for (const place of places) {
            const item = document.createElement("li");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sxr-places__place";
            const name = document.createElement("span");
            name.textContent = place.name;
            button.append(name);
            if (place.description) {
                const description = document.createElement("small");
                description.textContent = place.description;
                button.append(description);
            }
            button.addEventListener("click", () => this.choose(place));
            this.buttons.set(place.id, button);
            item.append(button);
            list.append(item);
        }
        this.element.append(list, this.speedControl());
        this.select(options.current);
        container.append(this.element);
        makeFoldable(this.element, {
            key: options.key,
            title: "Points of interest",
        });
    }

    /** Marks the place on screen, or none. */
    public select(id: string | undefined): void {
        for (const [placeId, button] of this.buttons) {
            if (placeId === id) button.setAttribute("aria-current", "true");
            else button.removeAttribute("aria-current");
        }
    }

    public dispose(): void {
        this.element.remove();
    }

    private choose(place: IPlace): void {
        if (!this.onSelect) {
            window.location.assign(placeUrl(place));
            return;
        }
        this.select(place.id);
        window.history.replaceState(null, "", placeUrl(place));
        this.onSelect(place, this.speed);
    }

    private speedControl(): HTMLElement {
        const label = document.createElement("label");
        label.className = "sxr-places__speed";
        label.append("Flight speed");
        const input = document.createElement("input");
        input.type = "range";
        input.min = "0.25";
        input.max = "4";
        input.step = "0.25";
        input.value = String(this.speed);
        const output = document.createElement("output");
        output.value = `x${this.speed}`;
        input.addEventListener("input", () => {
            this.speed = Number(input.value);
            output.value = `x${this.speed}`;
        });
        label.append(input, output);
        return label;
    }
}
