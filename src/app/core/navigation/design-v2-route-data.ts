import {Data, Params, Route, UrlSegment} from '@angular/router';

export type DesignV2PageWidth = 'standard' | 'wide' | 'full';

export interface DesignV2RouteData extends Data {
  pageId: string;
  mobileTitle: string;
  pageWidth: DesignV2PageWidth;
  ambientKey: string;
  preload: boolean;
  mobileBack?: boolean;
  cloudBackup?: boolean;
}

export const designV2RouteData = (
  pageId: string,
  mobileTitle: string,
  pageWidth: DesignV2PageWidth,
  ambientKey: string,
  options: Partial<Pick<DesignV2RouteData, 'preload' | 'mobileBack' | 'cloudBackup'>> = {}
): DesignV2RouteData => ({
  pageId,
  mobileTitle,
  pageWidth,
  ambientKey,
  preload: options.preload === true,
  ...options
});

export interface RouteSnapshotLike {
  data: Data;
  firstChild: RouteSnapshotLike | null;
}

export const deepestDesignV2RouteData = (root: RouteSnapshotLike): Partial<DesignV2RouteData> => {
  const merged: Data = {};
  let route: RouteSnapshotLike | null = root;
  while (route) {
    Object.assign(merged, route.data || {});
    route = route.firstChild;
  }
  return merged;
};

export type DesignV2Route = Route & {
  title: string;
  data: DesignV2RouteData;
  path?: string;
  matcher?: (segments: UrlSegment[]) => {consumed: UrlSegment[]; posParams?: Params} | null;
};
