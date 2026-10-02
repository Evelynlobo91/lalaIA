// Composição do módulo discovery (interna): liga as portas às APIs públicas de places e events.
import { searchEvents } from "@/modules/events";
import { placeIdsInNeighborhood, placeNeighborhoods, searchPlaces } from "@/modules/places";
import { lazy } from "@/shared/kernel";
import { SearchFilterFactory } from "./features/filters/filters.strategies";
import { GetFilterOptions } from "./features/filters/filters.use-case";
import { Search } from "./features/search/search.use-case";
import { EventsSearchSource, PlacesSearchSource } from "./infra/module-search-sources";

export const search = lazy(() => new Search(new PlacesSearchSource(searchPlaces), new EventsSearchSource(searchEvents)));
export const searchFilters = lazy(() => new SearchFilterFactory({ placeIdsIn: placeIdsInNeighborhood }));
export const filterOptions = lazy(() => new GetFilterOptions({ neighborhoods: placeNeighborhoods }));
