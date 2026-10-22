import { useCallback, useReducer, type SetStateAction } from "react";
import type { CubeSize } from "./cube";
import { solvedFacelets } from "./facelets";
export type Representation = "2d" | "text" | "3d";
export type SolverInput = { value: string; representation: Representation };
type Action =
  | { type: "value"; value: SetStateAction<string> }
  | { type: "representation"; representation: Representation };
export function solverInputReducer(state: SolverInput, action: Action): SolverInput {
  if (action.type === "representation")
    return { ...state, representation: action.representation };
  return {
    ...state,
    value: typeof action.value === "function" ? action.value(state.value) : action.value,
  };
}
export function useSolverInput(size: CubeSize = 3) {
  const [state, dispatch] = useReducer(solverInputReducer, {
    value: solvedFacelets(size),
    representation: "3d",
  });
  const setValue = useCallback((value: SetStateAction<string>) => dispatch({ type: "value", value }), []);
  const setRepresentation = useCallback((representation: Representation) => dispatch({ type: "representation", representation }), []);
  return { ...state, setValue, setRepresentation };
}
