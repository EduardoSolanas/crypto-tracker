// Single source of truth for the startup polygon mesh.
// Consumed by StartupScreen.js and scripts/generate-startup-overlays.mjs.
const V = {
    C_TL:  [0, 0],
    T0:    [27, 0],
    T1:    [158, 0],
    T2:    [254, 0],
    T3:    [322, 0],
    R_TOP: [412, 48],
    V0:    [86.5, 32.5],
    L0:    [0, 44.5],
    R0:    [412, 169],
    L1:    [0, 178],
    V1:    [41, 198],
    L2:    [0, 240],
    V2:    [282.5, 305],
    R1:    [412, 308.5],
    L3:    [0, 358],
    R2:    [412, 402.5],
    V3:    [179, 436],
    V4:    [318.5, 456.5],
    L4:    [0, 514],
    L5:    [0, 639.5],
    V5:    [73, 662.5],
    L6:    [0, 703.5],
    V6:    [180, 730],
    V7:    [410, 765.5],
    L7:    [0, 903],
    B0:    [11, 915],
    C_BL:  [0, 915],
};

export const STARTUP_POLYGONS = [
    { id: 'P20', side: 'left',  pts: ['L7', 'V5', 'V6', 'B0', 'C_BL'] },
    { id: 'P18', side: 'right', pts: ['V4', 'V7', 'V6'] },
    { id: 'P19', side: 'left',  pts: ['L6', 'V5', 'L7'] },
    { id: 'P17', side: 'right', pts: ['V3', 'V4', 'V6'] },
    { id: 'P15', side: 'left',  pts: ['L5', 'V5', 'L6'] },
    { id: 'P16', side: 'right', pts: ['V3', 'V6', 'V5'] },
    { id: 'P14', side: 'left',  pts: ['L4', 'V5', 'L5'] },
    { id: 'P12', side: 'right', pts: ['V2', 'R1', 'R2', 'V4'] },
    { id: 'P13', side: 'left',  pts: ['L3', 'V3', 'V5', 'L4'] },
    { id: 'P11', side: 'right', pts: ['V2', 'V4', 'V3'] },
    { id: 'P9',  side: 'left',  pts: ['L2', 'V1', 'V3', 'L3'] },
    { id: 'P8',  side: 'right', pts: ['V2', 'R0', 'R1'] },
    { id: 'P4',  side: 'left',  pts: ['L1', 'V1', 'L2'] },
    { id: 'P10', side: 'right', pts: ['V1', 'V2', 'V3'] },
    { id: 'P3',  side: 'left',  pts: ['L0', 'V1', 'L1'] },
    { id: 'P7',  side: 'right', pts: ['T2', 'T3', 'R_TOP', 'R0', 'V2'] },
    { id: 'P1',  side: 'left',  pts: ['C_TL', 'T0', 'V0', 'V1', 'L0'] },
    { id: 'P6',  side: 'right', pts: ['V0', 'V2', 'V1'] },
    { id: 'P2',  side: 'left',  pts: ['T0', 'T1', 'V0'] },
    { id: 'P5',  side: 'right', pts: ['T1', 'T2', 'V2', 'V0'] },
];

export { V };

export default STARTUP_POLYGONS;
