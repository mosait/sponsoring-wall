import React from 'react';
import { motion } from 'framer-motion';

const SajadahElement = ({ isBooked, delay, index, isMinified, isOverflow }) => {

    if (isMinified) {
        return (
            <motion.div
                layout
                className="h-4 w-full rounded-sm border"
                style={{ background: '#3da87a', borderColor: '#2d8a63' }}
                title={`Platz ${index + 1}`}
            />
        );
    }

    // Farben je nach Status
    const bg = isBooked
        ? 'linear-gradient(to bottom, #4db88a, #2d8a63)'
        : 'linear-gradient(to bottom, #f9c4c4, #f0abab)';
    const borderColor = isBooked ? '#3da87a' : '#edb8b8';
    const shadow = isBooked
        ? '0 2px 8px rgba(45,138,99,0.25)'
        : '0 2px 6px rgba(220,160,160,0.2)';

    // Muster-Farben
    const line1 = isBooked ? 'rgba(255,255,255,0.3)' : 'rgba(153,27,27,0.22)';
    const line2 = isBooked ? 'rgba(255,255,255,0.2)' : 'rgba(153,27,27,0.15)';
    const line3 = isBooked ? 'rgba(255,255,255,0.15)' : 'rgba(153,27,27,0.12)';
    const dotCol = isBooked ? 'rgba(255,255,255,0.35)' : 'rgba(153,27,27,0.2)';
    const fransenCol = isBooked ? 'rgba(255,255,255,0.18)' : 'rgba(153,27,27,0.12)';

    return (
        <motion.div
            layout
            initial={{ scale: 0.8, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{
                delay: delay * 0.15,
                duration: 0.5,
                ease: [0.23, 1, 0.32, 1]
            }}
            className="relative group w-full"
        >
            <div
                className="relative w-full aspect-[2/3] rounded-xl transition-all duration-500 overflow-hidden"
                style={{ background: bg, border: `1px solid ${borderColor}`, boxShadow: shadow }}
            >
                {/* === Teppich-Rand (innerer Rahmen) === */}
                <div className="absolute rounded-lg" style={{
                    top: '6%', left: '8%', right: '8%', bottom: '14%',
                    border: `1.5px solid ${line1}`,
                    borderRadius: '6px',
                }} />

                {/* === Mihrab Bogen (äußerer) === */}
                <div className="absolute rounded-t-full" style={{
                    top: '10%', left: '18%', right: '18%', height: '42%',
                    borderTop: `2px solid ${line1}`,
                    borderLeft: `1.5px solid ${line1}`,
                    borderRight: `1.5px solid ${line1}`,
                }} />

                {/* === Mihrab Bogen (innerer) === */}
                <div className="absolute rounded-t-full" style={{
                    top: '16%', left: '26%', right: '26%', height: '30%',
                    borderTop: `1.5px solid ${line2}`,
                    borderLeft: `1px solid ${line2}`,
                    borderRight: `1px solid ${line2}`,
                }} />

                {/* === Spitze des Mihrab (Tropfen/Lampe) === */}
                <div className="absolute left-1/2 -translate-x-1/2" style={{
                    top: '13%', width: '4px', height: '4px',
                    borderRadius: '50%', background: dotCol,
                }} />

                {/* === Hängelampe Linie === */}
                <div className="absolute left-1/2" style={{
                    top: '8%', width: '1px', height: '5%',
                    background: line3,
                    transform: 'translateX(-50%)',
                }} />

                {/* === Horizontale Zierlinien (Teppichmuster) === */}
                <div className="absolute" style={{
                    bottom: '30%', left: '15%', right: '15%', height: '1px',
                    background: line2,
                }} />
                <div className="absolute" style={{
                    bottom: '25%', left: '20%', right: '20%', height: '1px',
                    background: line3,
                }} />
                <div className="absolute" style={{
                    bottom: '20%', left: '15%', right: '15%', height: '1px',
                    background: line2,
                }} />

                {/* === Eck-Ornamente === */}
                <div className="absolute" style={{
                    top: '8%', left: '10%', width: '6px', height: '6px',
                    borderTop: `1px solid ${line2}`, borderLeft: `1px solid ${line2}`,
                }} />
                <div className="absolute" style={{
                    top: '8%', right: '10%', width: '6px', height: '6px',
                    borderTop: `1px solid ${line2}`, borderRight: `1px solid ${line2}`,
                }} />

                {/* === Fransen (unten) === */}
                <div className="absolute flex justify-around" style={{
                    bottom: '3%', left: '12%', right: '12%', height: '8%',
                }}>
                    {[...Array(7)].map((_, i) => (
                        <div key={i} style={{
                            width: '1px', height: '100%',
                            background: fransenCol,
                        }} />
                    ))}
                </div>

                {/* Hover Nummer */}
                <div
                    className="group-hover:opacity-100"
                    style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0,
                        color: isBooked ? '#ffffff' : 'rgb(153, 27, 27)',
                        fontSize: '11px', fontWeight: 700,
                        transition: 'opacity 0.2s',
                    }}
                >
                    {index + 1}
                </div>
            </div>
        </motion.div>
    );
};

export default SajadahElement;
