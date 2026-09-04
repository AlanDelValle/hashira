import { useCallback } from 'react';

import { replaceElements } from '@/editor/commands/command';
import { polygonArea } from '@/editor/geometry/polygon';
import {
    angleFrame,
    dimensionFrame,
    ELEMENT_TYPE_NAMES,
    elementLength,
    elementWorldPoints,
    makeLookup,
    radiusFrame,
} from '@/editor/model/elements';
import {
    segmentAngle,
    setAngleRadius,
    setDimensionOffset,
    setDimensionSize,
    setAssetMirrored,
    setAssetSize,
    setCircleRadius,
    setCloudRadius,
    setDoorFlipped,
    setDoorLeaf,
    setDoorSwing,
    setHatch,
    setLayer,
    setLineType,
    setOpeningHead,
    setOpeningOffset,
    setOpeningWidth,
    setPosition,
    setRadiusAngle,
    setRadiusDiameter,
    setRectSize,
    setRotation,
    setSegmentAngle,
    setSegmentLength,
    setTextContent,
    setTextSize,
    setUnderlayOpacity,
    setUnderlaySize,
    setWallThickness,
} from '@/editor/model/edits';
import { HATCHABLE, LINE_TYPED } from '@/editor/model/conventions';
import { HATCH_OPTIONS } from '@/editor/model/hatches';
import { DEFAULT_LINE_TYPE, LINE_TYPE_OPTIONS } from '@/editor/model/lineTypes';
import { JAMB_LABEL, LEAF_OPTIONS, SIDE_LABEL } from '@/editor/model/openings';
import { wallSides } from '@/editor/model/walls';
import type {
    DisplayUnit,
    DoorLeaf,
    Element,
    HatchPattern,
    LineType,
    OpeningHead,
} from '@/editor/model/types';
import {
    formatAngle,
    formatArea,
    formatLength,
    formatLengthValue,
    parseAngle,
    parseLength,
} from '@/editor/model/units';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { ChoiceRow, MeasureField, ReadonlyRow, ToggleRow } from './MeasureField';

/**
 * The properties of what is selected, as values you can type into.
 *
 * Every field here writes through a command, so an edit made by typing undoes exactly like an
 * edit made by dragging. Consecutive edits to the same field coalesce, which is what stops
 * arrowing a number spinner from filling the history.
 */
export function PropertiesPanel() {
    const drawing = useDocumentStore((state) => state.document);
    const selection = useEditorStore((state) => state.selection);

    const lookup = makeLookup(drawing.elements);
    const selected = selection.flatMap((id) => {
        const element = lookup(id);

        return element === undefined ? [] : [element];
    });

    const apply = useCallback((element: Element, next: Element, label: string, field: string) => {
        if (next === element) {
            return;
        }

        runCommand(replaceElements([element], [next], label, `${field}:${element.id}`));
    }, []);

    if (selected.length === 0) {
        return <p className="text-ink-subtle px-3 text-[13px]">Nothing selected.</p>;
    }

    if (selected.length > 1) {
        return (
            <div className="space-y-2 px-3">
                <ReadonlyRow label="Selected" value={String(selected.length)} />
                <p className="text-ink-subtle text-[12px]">
                    Select a single element to edit its properties.
                </p>
            </div>
        );
    }

    const element = selected[0];

    if (element === undefined) {
        return null;
    }

    return (
        <ElementProperties
            element={element}
            unit={drawing.settings.unit}
            layers={drawing.layers}
            apply={apply}
        />
    );
}

interface ElementPropertiesProps {
    element: Element;
    unit: DisplayUnit;
    layers: { id: string; name: string }[];
    apply: (element: Element, next: Element, label: string, field: string) => void;
}

function ElementProperties({ element, unit, layers, apply }: ElementPropertiesProps) {
    const length = (value: number) => formatLengthValue(value, unit);
    const toLength = (text: string) => parseLength(text, unit);
    const angle = segmentAngle(element);
    const jambLabel = element.type === 'door' ? JAMB_LABEL[element.geometry.leaf] : undefined;
    const sideLabel = element.type === 'door' ? SIDE_LABEL[element.geometry.leaf] : undefined;

    function set(next: Element, label: string, field: string) {
        apply(element, next, label, field);
    }

    return (
        <div className="space-y-2 px-3">
            <ReadonlyRow label="Type" value={ELEMENT_TYPE_NAMES[element.type]} />

            {element.type !== 'door' && element.type !== 'window' && element.type !== 'radius' && (
                <>
                    <MeasureField
                        label="X"
                        value={element.transform.x}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(x) =>
                            set(setPosition(element, x, element.transform.y), 'Move', 'x')
                        }
                    />
                    <MeasureField
                        label="Y"
                        value={element.transform.y}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(y) =>
                            set(setPosition(element, element.transform.x, y), 'Move', 'y')
                        }
                    />
                </>
            )}

            {(element.type === 'wall' || element.type === 'line') && (
                <>
                    <MeasureField
                        label="Length"
                        value={elementLength(element) ?? 0}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(setSegmentLength(element, value), 'Length', 'length')
                        }
                    />
                    <MeasureField
                        label="Angle"
                        value={angle ?? 0}
                        format={(value) => formatAngle(value, 1).replace('°', '')}
                        parse={parseAngle}
                        suffix="°"
                        onCommit={(value) => set(setSegmentAngle(element, value), 'Angle', 'angle')}
                    />
                </>
            )}

            {LINE_TYPED.includes(element.type) && (
                <ChoiceRow<LineType>
                    label="Line"
                    value={element.style?.lineType ?? DEFAULT_LINE_TYPE}
                    options={LINE_TYPE_OPTIONS}
                    onChange={(value) => set(setLineType(element, value), 'Line type', 'lineType')}
                />
            )}

            {HATCHABLE.includes(element.type) && (
                <ChoiceRow<HatchPattern | 'none'>
                    label="Hatch"
                    value={element.style?.hatch ?? 'none'}
                    options={HATCH_OPTIONS}
                    onChange={(value) => set(setHatch(element, value), 'Hatch', 'hatch')}
                />
            )}

            {element.type === 'wall' && (
                <>
                    <MeasureField
                        label="Thickness"
                        value={element.geometry.thickness}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(setWallThickness(element, value), 'Thickness', 'thickness')
                        }
                    />
                    <WallFaceLengths element={element} unit={unit} />
                </>
            )}

            {element.type === 'rect' && (
                <>
                    <MeasureField
                        label="Width"
                        value={element.geometry.width}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(
                                setRectSize(element, value, element.geometry.height),
                                'Size',
                                'width',
                            )
                        }
                    />
                    <MeasureField
                        label="Height"
                        value={element.geometry.height}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(
                                setRectSize(element, element.geometry.width, value),
                                'Size',
                                'height',
                            )
                        }
                    />
                </>
            )}

            {element.type === 'circle' && (
                <MeasureField
                    label="Radius"
                    value={element.geometry.radius}
                    format={length}
                    parse={toLength}
                    suffix={unit}
                    onCommit={(value) => set(setCircleRadius(element, value), 'Radius', 'radius')}
                />
            )}

            {element.type === 'asset' && (
                <>
                    <MeasureField
                        label="Width"
                        value={element.geometry.width}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(
                                setAssetSize(element, value, element.geometry.height),
                                'Size',
                                'width',
                            )
                        }
                    />
                    <MeasureField
                        label="Depth"
                        value={element.geometry.height}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(
                                setAssetSize(element, element.geometry.width, value),
                                'Size',
                                'height',
                            )
                        }
                    />
                    <ToggleRow
                        label="Mirrored"
                        checked={element.geometry.mirrored}
                        onChange={(value) =>
                            set(setAssetMirrored(element, value), 'Mirror', 'mirrored')
                        }
                    />
                </>
            )}

            {(element.type === 'door' || element.type === 'window') && (
                <>
                    <MeasureField
                        label="Width"
                        value={element.geometry.width}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(setOpeningWidth(element, value), 'Opening width', 'width')
                        }
                    />
                    <MeasureField
                        label="From wall start"
                        value={element.geometry.offset}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(setOpeningOffset(element, value), 'Opening position', 'offset')
                        }
                    />
                </>
            )}

            {element.type === 'door' && (
                <>
                    <ChoiceRow<DoorLeaf>
                        label="Operation"
                        value={element.geometry.leaf}
                        options={LEAF_OPTIONS}
                        onChange={(value) => set(setDoorLeaf(element, value), 'Operation', 'leaf')}
                    />
                    <ChoiceRow<OpeningHead>
                        label="Head"
                        value={element.geometry.head}
                        options={[
                            { value: 'square', label: 'Square' },
                            { value: 'arch', label: 'Arched' },
                        ]}
                        onChange={(value) => set(setOpeningHead(element, value), 'Head', 'head')}
                    />
                    {/*
                     * Which jamb and which side only mean something to an opening that works
                     * off one. A double door uses both jambs, an overhead door neither, and a
                     * cased opening does not move at all — so the tables in model/openings.ts
                     * decide which of these two rows exist, rather than a panel offering a
                     * control that changes nothing on the sheet.
                     */}
                    {jambLabel !== undefined && (
                        <ChoiceRow
                            label={jambLabel}
                            value={element.geometry.swing}
                            options={[
                                { value: 'left', label: 'Start' },
                                { value: 'right', label: 'End' },
                            ]}
                            onChange={(value) => set(setDoorSwing(element, value), 'Jamb', 'swing')}
                        />
                    )}
                    {sideLabel !== undefined && (
                        <ToggleRow
                            label={sideLabel}
                            checked={element.geometry.flipped}
                            onChange={(value) =>
                                set(setDoorFlipped(element, value), 'Opening side', 'flipped')
                            }
                        />
                    )}
                </>
            )}

            {element.type === 'text' && (
                <>
                    <TextRow
                        label="Content"
                        value={element.geometry.content}
                        onCommit={(value) => set(setTextContent(element, value), 'Text', 'content')}
                    />
                    <MeasureField
                        label="Size"
                        value={element.geometry.fontSize}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) => set(setTextSize(element, value), 'Text size', 'size')}
                    />
                </>
            )}

            {element.type === 'dimension' && (
                <>
                    {/*
                     * Read-only on purpose. The measurement comes from the two points it
                     * spans; a dimension you can type over is a drawing that says one length
                     * and shows another.
                     */}
                    <ReadonlyRow
                        label="Measures"
                        value={formatLength(dimensionFrame(element)?.length ?? 0, unit)}
                    />
                    <MeasureField
                        label="Offset"
                        value={element.geometry.offset}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(setDimensionOffset(element, value), 'Dimension offset', 'offset')
                        }
                    />
                    <MeasureField
                        label="Size"
                        value={element.geometry.fontSize}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(setDimensionSize(element, value), 'Dimension size', 'size')
                        }
                    />
                </>
            )}

            {element.type === 'angle' && (
                <>
                    {/* Read-only for the same reason a length is: the two legs are the angle. */}
                    <ReadonlyRow
                        label="Measures"
                        value={formatAngle(angleFrame(element)?.angle ?? 0)}
                    />
                    <MeasureField
                        label="Arc"
                        value={element.geometry.radius}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) => set(setAngleRadius(element, value), 'Arc', 'radius')}
                    />
                    <MeasureField
                        label="Size"
                        value={element.geometry.fontSize}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(setDimensionSize(element, value), 'Angle size', 'size')
                        }
                    />
                </>
            )}

            {element.type === 'radius' && <RadiusRows element={element} unit={unit} set={set} />}

            {element.type === 'leader' && (
                <>
                    <TextRow
                        label="Note"
                        value={element.geometry.content}
                        onCommit={(value) => set(setTextContent(element, value), 'Note', 'content')}
                    />
                    <MeasureField
                        label="Size"
                        value={element.geometry.fontSize}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) => set(setTextSize(element, value), 'Note size', 'size')}
                    />
                </>
            )}

            {element.type === 'cloud' && (
                <MeasureField
                    label="Bump"
                    value={element.geometry.radius}
                    format={length}
                    parse={toLength}
                    suffix={unit}
                    onCommit={(value) =>
                        set(setCloudRadius(element, value), 'Cloud bump', 'radius')
                    }
                />
            )}

            {element.type === 'underlay' && (
                <>
                    <MeasureField
                        label="Width"
                        value={element.geometry.width}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(
                                setUnderlaySize(element, value, element.geometry.height),
                                'Underlay size',
                                'size',
                            )
                        }
                    />
                    <MeasureField
                        label="Height"
                        value={element.geometry.height}
                        format={length}
                        parse={toLength}
                        suffix={unit}
                        onCommit={(value) =>
                            set(
                                setUnderlaySize(element, element.geometry.width, value),
                                'Underlay size',
                                'size',
                            )
                        }
                    />
                    <MeasureField
                        label="Opacity"
                        value={element.geometry.opacity}
                        format={(value) => String(Math.round(value * 100))}
                        parse={(value) => {
                            const percent = Number(value.replace('%', '').trim());

                            return Number.isFinite(percent) ? percent / 100 : null;
                        }}
                        suffix="%"
                        onCommit={(value) =>
                            set(setUnderlayOpacity(element, value), 'Underlay opacity', 'opacity')
                        }
                    />
                </>
            )}

            {element.type === 'room' && <RoomArea element={element} unit={unit} />}

            {element.type !== 'door' && element.type !== 'window' && (
                <MeasureField
                    label="Rotation"
                    value={element.transform.rotation}
                    format={(value) => formatAngle(value, 1).replace('°', '')}
                    parse={parseAngle}
                    suffix="°"
                    onCommit={(value) => set(setRotation(element, value), 'Rotate', 'rotation')}
                />
            )}

            <ChoiceRow
                label="Layer"
                value={element.layerId}
                options={layers.map((layer) => ({ value: layer.id, label: layer.name }))}
                onChange={(value) => set(setLayer(element, value), 'Layer', 'layer')}
            />
        </div>
    );
}

/** Area is measured from the geometry, so it is shown rather than offered for editing. */
/**
 * What a radius measures, and whether it is measuring the radius or the diameter.
 *
 * The circle is where the value comes from, so this reads it out of the document rather than
 * out of the element: the measurement itself stores only which circle and which way round.
 */
function RadiusRows({
    element,
    unit,
    set,
}: {
    element: Element & { type: 'radius' };
    unit: DisplayUnit;
    set: (next: Element, label: string, field: string) => void;
}) {
    const drawing = useDocumentStore.getState().document;
    const frame = radiusFrame(element, makeLookup(drawing.elements));

    return (
        <>
            <ReadonlyRow label="Measures" value={formatLength(frame?.measured ?? 0, unit)} />
            <ToggleRow
                label="Diameter"
                checked={element.geometry.diameter}
                onChange={(value) => set(setRadiusDiameter(element, value), 'Diameter', 'diameter')}
            />
            <MeasureField
                label="Direction"
                value={element.geometry.angle}
                format={(value) => formatAngle(value, 1).replace('°', '')}
                parse={parseAngle}
                suffix="°"
                onCommit={(value) => set(setRadiusAngle(element, value), 'Direction', 'angle')}
            />
        </>
    );
}

/**
 * How long each face of a wall is, which is not how long the wall is.
 *
 * Where a wall meets another its band is mitred, so one face runs past the corner and the
 * other stops short of it: the two numbers a person setting the job out measures on site are
 * neither of them the centreline they typed in. Both are read off the joins, so they follow a
 * neighbouring wall being moved without anything being stored.
 *
 * Shown rather than offered for editing, like an area. A face is a consequence of where the
 * walls are; typing 3.05 into it would be asking the drawing to change a corner it cannot
 * know the shape of.
 */
function WallFaceLengths({
    element,
    unit,
}: {
    element: Element & { type: 'wall' };
    unit: DisplayUnit;
}) {
    // Read rather than subscribed to, like the room's area below: the panel above already
    // re-renders on every document change, and a second subscription to the same thing would
    // only be another way of hearing the same news.
    const sides = wallSides(useDocumentStore.getState().document, element);

    if (sides === null) {
        return null;
    }

    // Inside first where the two are told apart, because that is the one a room is measured
    // against. Otherwise in the order the geometry names them, which has no meaning to prefer.
    const ordered =
        sides.left.encloses && !sides.right.encloses
            ? [sides.left, sides.right]
            : [sides.right, sides.left];

    return (
        <>
            {ordered.map((side) => (
                <ReadonlyRow
                    key={side.label}
                    label={side.label}
                    value={formatLength(side.face.length, unit)}
                />
            ))}
        </>
    );
}

function RoomArea({ element, unit }: { element: Element & { type: 'room' }; unit: DisplayUnit }) {
    const drawing = useDocumentStore.getState().document;
    const points = elementWorldPoints(element, makeLookup(drawing.elements));
    return <ReadonlyRow label="Area" value={formatArea(polygonArea(points), unit)} />;
}

function TextRow({
    label,
    value,
    onCommit,
}: {
    label: string;
    value: string;
    onCommit: (value: string) => void;
}) {
    return (
        <div className="space-y-1">
            <span className="text-ink-muted text-[13px]">{label}</span>
            <input
                defaultValue={value}
                key={value}
                onBlur={(event) => onCommit(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                }}
                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-6 w-full rounded-sm border px-1.5 text-[12px] transition-colors"
            />
        </div>
    );
}
