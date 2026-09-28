import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
const AssetsPage = lazy(() => import("@/pages/assets"));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const ConfigPage = lazy(() => import("@/pages/config"));
const HomePage = lazy(() => import("@/pages/home"));
const ImagePage = lazy(() => import("@/pages/image"));
const NotFound = lazy(() => import("@/pages/not-found"));
const PromptsPage = lazy(() => import("@/pages/prompts"));
const VideoPage = lazy(() => import("@/pages/video"));

function lazyElement(Component: React.LazyExoticComponent<React.ComponentType>) {
    return (
        <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-stone-500">Loading…</div>}>
            <Component />
        </Suspense>
    );
}

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: lazyElement(HomePage) },
            { path: "/image", element: lazyElement(ImagePage) },
            { path: "/video", element: lazyElement(VideoPage) },
            { path: "/assets", element: lazyElement(AssetsPage) },
            { path: "/prompts", element: lazyElement(PromptsPage) },
            { path: "/canvas", element: lazyElement(CanvasPage) },
            { path: "/canvas/:id", element: lazyElement(CanvasProjectPage) },
            { path: "/config", element: lazyElement(ConfigPage) },
        ],
    },
    { path: "*", element: lazyElement(NotFound) },
]);
