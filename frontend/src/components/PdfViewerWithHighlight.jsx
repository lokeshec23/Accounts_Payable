import React, { useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import {
    LeftOutlined,
    RightOutlined,
    PlusOutlined,
    MinusOutlined,
    FullscreenOutlined,
    ColumnWidthOutlined,
    RotateLeftOutlined,
    RotateRightOutlined
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";

pdfjs.GlobalWorkerOptions.workerSrc =
    "https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.mjs";

const PdfViewerWithHighlight = ({ file, extractedData }) => {
    const viewerRef = useRef(null);
    const canvasRef = useRef(null);
    const highlightRef = useRef(null);

    const [pdfObj, setPdfObj] = useState(null);
    const [page, setPage] = useState(1);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [autoFit, setAutoFit] = useState(false);

    const [containerWidth, setContainerWidth] = useState(0);
    const [containerReady, setContainerReady] = useState(false);

    const initialRenderDoneRef = useRef(false);

    /** ----------------------------------------
     * Extract bounding regions
     * ---------------------------------------- */
    const extractRegions = () => {
        const list = [];
        const scan = (obj) => {
            if (!obj || typeof obj !== "object") return;
            if (Array.isArray(obj.bounding_regions)) {
                obj.bounding_regions.forEach((r) => {
                    if (r.page_number && r.polygon?.length >= 8) list.push(r);
                });
            }
            Object.values(obj).forEach(scan);
        };
        scan(extractedData);
        return list;
    };

    const regions = extractRegions();

    /** ----------------------------------------
     * Track container width
     * ---------------------------------------- */
    useEffect(() => {
        if (!viewerRef.current) return;

        const measure = () => {
            const width = viewerRef.current.clientWidth;
            if (width > 0) {
                setContainerWidth(width);
                setContainerReady(true);
            }
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(viewerRef.current);

        return () => ro.disconnect();
    }, []);

    /** ----------------------------------------
     * Load PDF after container ready
     * ---------------------------------------- */
    useEffect(() => {
        if (!file || !containerReady) return;

        const loadPDF = async () => {
            try {
                const loadingTask = pdfjs.getDocument(file);
                const loaded = await loadingTask.promise;

                setPdfObj(loaded);

                // FORCE UPRIGHT INITIAL RENDER (previous behavior)
                setScale(0.86);
                setRotation(0);

                await new Promise((res) => setTimeout(res, 50));

                await renderPage(loaded, 1, 0.86, 0);
                initialRenderDoneRef.current = true;

                // Enable auto-fit AFTER initial render completes
                setTimeout(() => {
                    setAutoFit(true);
                }, 150);

            } catch (err) {
                console.error("PDF load error:", err);
            }
        };

        loadPDF();
    }, [file, containerReady]);

    /** ----------------------------------------
     * Auto-fit when width changes
     * ---------------------------------------- */
    useEffect(() => {
        if (!initialRenderDoneRef.current) return; // BLOCK premature auto-fit
        if (!pdfObj || !autoFit || containerWidth === 0) return;

        const timer = setTimeout(() => {
            autoFitWidth(pdfObj, page, rotation);
        }, 80);

        return () => clearTimeout(timer);
    }, [containerWidth]);

    /** ----------------------------------------
     * Render PDF page correctly
     * ---------------------------------------- */
    const renderPage = async (pdf, pageNum, scaleVal, rotationVal) => {
        try {
            const pageObj = await pdf.getPage(pageNum);

            const internalRotation = 0; // IGNORE PDF internal rotation (fix)

            const viewport = pageObj.getViewport({
                scale: scaleVal,
                rotation: (internalRotation + rotationVal) % 360,
            });

            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await pageObj.render({ canvasContext: ctx, viewport }).promise;

            drawHighlights(pageObj, viewport, pageNum);

        } catch (err) {
            console.error("Render Error:", err);
        }
    };

    /** ----------------------------------------
     * Draw Region Highlights
     * ---------------------------------------- */
    const drawHighlights = (pageObj, viewport, pageNum) => {
        const overlay = highlightRef.current;
        if (!overlay) return;

        overlay.innerHTML = "";
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;

        const pageHeightPts = pageObj.view[3] || 792;
        const filtered = regions.filter((r) => r.page_number === pageNum);

        filtered.forEach((r) => {
            const xs = [];
            const ys = [];

            for (let i = 0; i < r.polygon.length; i += 2) {
                const xInch = r.polygon[i];
                const yInch = r.polygon[i + 1];

                const xPt = xInch * 72;
                const yPt = pageHeightPts - yInch * 72;

                const [vx, vy] = viewport.convertToViewportPoint(xPt, yPt);
                xs.push(vx);
                ys.push(vy);
            }

            const box = document.createElement("div");
            box.style.position = "absolute";
            box.style.left = `${Math.min(...xs)}px`;
            box.style.top = `${Math.min(...ys)}px`;
            box.style.width = `${Math.max(...xs) - Math.min(...xs)}px`;
            box.style.height = `${Math.max(...ys) - Math.min(...ys)}px`;
            box.style.background = "rgba(144, 238, 144, 0.35)";
            box.style.border = "2px solid rgba(60, 179, 113, 0.9)";
            box.style.pointerEvents = "none";

            overlay.appendChild(box);
        });
    };

    /** ----------------------------------------
     * AUTO-FIT WIDTH
     * ---------------------------------------- */
    const autoFitWidth = async (pdf, pageNum, rotationVal) => {
        if (!viewerRef.current) return;

        const width = viewerRef.current.clientWidth;
        if (width <= 0) return;

        try {
            const pageObj = await pdf.getPage(pageNum);

            const viewportTest = pageObj.getViewport({
                scale: 1,
                rotation: rotationVal,
            });

            const newScale = width / viewportTest.width;

            setScale(newScale);

            renderPage(pdf, pageNum, newScale, rotationVal);

        } catch (err) {
            console.error("Auto-fit error:", err);
        }
    };

    /** ----------------------------------------
     * Page Navigation
     * ---------------------------------------- */
    const changePage = (delta) => {
        if (!pdfObj) return;

        const target = page + delta;
        if (target < 1 || target > pdfObj.numPages) return;

        setPage(target);

        if (autoFit) autoFitWidth(pdfObj, target, rotation);
        else renderPage(pdfObj, target, scale, rotation);
    };

    /** ----------------------------------------
     * Zoom
     * ---------------------------------------- */
    const zoom = (amount) => {
        setAutoFit(false);
        const newScale = Math.max(0.3, scale + amount);
        setScale(newScale);
        renderPage(pdfObj, page, newScale, rotation);
    };

    /** ----------------------------------------
     * Rotation
     * ---------------------------------------- */
    const rotate = (deg) => {
        const newRotation = (rotation + deg + 360) % 360;
        setRotation(newRotation);

        if (autoFit) autoFitWidth(pdfObj, page, newRotation);
        else renderPage(pdfObj, page, scale, newRotation);
    };

    /** ----------------------------------------
     * FIT TO PAGE HEIGHT
     * ---------------------------------------- */
    const fitToPage = async () => {
        if (!pdfObj || !viewerRef.current) return;

        const height = viewerRef.current.clientHeight;
        const pageObj = await pdfObj.getPage(page);

        const viewportTest = pageObj.getViewport({
            scale: 1,
            rotation,
        });

        const newScale = height / viewportTest.height;

        setScale(newScale);
        setAutoFit(false);

        renderPage(pdfObj, page, newScale, rotation);
    };

    /** ----------------------------------------
     * UI Layout
     * ---------------------------------------- */
    return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>

            {/* Toolbar */}
            <div style={{
                padding: "6px 10px",
                background: "#fff",
                borderBottom: "1px solid #ddd",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button size="small" icon={<LeftOutlined />} onClick={() => changePage(-1)} />
                    <Button size="small" icon={<RightOutlined />} onClick={() => changePage(1)} />
                    <span>Page {page} / {pdfObj?.numPages || "--"}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button size="small" icon={<RotateLeftOutlined />} onClick={() => rotate(-90)} />
                    <Button size="small" icon={<RotateRightOutlined />} onClick={() => rotate(90)} />

                    <Button size="small" icon={<MinusOutlined />} onClick={() => zoom(-0.2)} />
                    <Button size="small" icon={<PlusOutlined />} onClick={() => zoom(0.2)} />

                    <Tooltip title="Fit to Width">
                        <Button
                            size="small"
                            icon={<ColumnWidthOutlined />}
                            onClick={() => { setAutoFit(true); autoFitWidth(pdfObj, page, rotation); }}
                            type={autoFit ? "primary" : "default"}
                        />
                    </Tooltip>

                    <Tooltip title="Fit to Page Height">
                        <Button size="small" icon={<FullscreenOutlined />} onClick={fitToPage} />
                    </Tooltip>

                    <span style={{ minWidth: 50, textAlign: "center" }}>
                        {Math.round(scale * 100)}%
                    </span>
                </div>
            </div>

            {/* Viewer */}
            <div
                ref={viewerRef}
                style={{
                    flex: 1,
                    overflow: "auto",
                    position: "relative",
                    background: "#f5f5f5",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-start",
                }}
            >
                <div style={{ position: "relative" }}>
                    <canvas ref={canvasRef} style={{ display: "block" }} />
                    <div ref={highlightRef} style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        pointerEvents: "none",
                    }} />
                </div>
            </div>
        </div>
    );
};

export default PdfViewerWithHighlight;
