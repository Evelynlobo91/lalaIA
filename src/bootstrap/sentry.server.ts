import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/shared/observability/sentry-options";

Sentry.init(sentryOptions(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN));
