export const formatDateTimeIST = (dateString) => {
    if (!dateString) return '—';

    try {
        // Fix microseconds (convert 6 digits → 3 digits)
        let normalized = dateString.replace(/\.(\d{3})\d+/, '.$1');

        // Force UTC by appending Z if missing
        if (!normalized.endsWith('Z')) {
            normalized += 'Z';
        }

        const date = new Date(normalized);

        return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).toUpperCase();

    } catch (err) {
        console.error("Date formatting error:", err);
        return dateString;
    }
};
