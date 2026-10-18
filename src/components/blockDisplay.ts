import type { BlockTitleSize } from "../store/types";

export const BLOCK_TITLE_SIZE_OPTIONS: BlockTitleSize[] = ["sm", "md", "lg"];
export const BLOCK_TITLE_SIZE_PX: Record<BlockTitleSize, number> = {
  sm: 14,
  md: 16,
  lg: 18.5,
};
