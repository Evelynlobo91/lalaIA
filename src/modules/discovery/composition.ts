// Composição do módulo discovery (interna): liga as portas às APIs públicas de places e events.
import { searchEvents } from "@/modules/events";
import { searchPlaces } from "@/modules/places";
import { lazy } from "@/shared/kernel";
import { Search } from "./features/search/search.use-case";
import { EventsSearchSource, PlacesSearchSource } from "./infra/module-search-sources";

export const search = lazy(() => new Search(new PlacesSearchSource(searchPlaces), new EventsSearchSource(searchEvents)));
