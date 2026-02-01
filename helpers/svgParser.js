const fs = require('fs-extra');
const sharp = require('sharp');
const path = require('path');

async function convertSvgToPng(options) {
    const { inputDir, outputDir, width, height = width } = options;

    // Создаем выходную папку
    await fs.ensureDir(outputDir);

    // Читаем все SVG файлы
    const svgFiles = await fs.readdir(inputDir)
        .then(files => files.filter(f => f.toLowerCase().endsWith('.svg')));

    console.log(`Найдено SVG файлов: ${svgFiles.length}`);

    for (const file of svgFiles) {
        const inputPath = path.join(inputDir, file);
        const outputName = path.basename(file, '.svg') + '.png';
        const outputPath = path.join(outputDir, outputName);

        try {
            console.log(`Конвертирую ${file} → ${outputName}`);

            // Sharp конвертирует SVG в PNG
            await sharp(inputPath, { density: 300 })
                .resize(width, height, { 
                    fit: 'contain', 
                    background: { r: 0, g: 0, b: 0, alpha: 0 } 
                })
                .png({ quality: 100, compressionLevel: 0 })
                .toFile(outputPath);

            console.log(`✓ ${outputName} готово (${width}x${height})`);
        } catch (error) {
            console.error(`✗ Ошибка ${file}:`, error.message);
        }
    }

    console.log(`\nГотово! PNG файлы в: ${outputDir}`);
}

// Использование
const INPUT_DIR = './helpers/svg-input';   // ← папка с SVG
const OUTPUT_DIR = './helpers/png-output'; // ← куда сохранить
const RESOLUTION = {
    1024: {
        w: 380,
        h: 190
    }
};           // ← разрешение

convertSvgToPng({
    inputDir: INPUT_DIR,
    outputDir: OUTPUT_DIR,
    width: RESOLUTION[1024].w,
    height: RESOLUTION[1024].h
}).catch(console.error);
