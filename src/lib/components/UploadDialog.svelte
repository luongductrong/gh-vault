<script lang="ts">
	import { Upload, LoaderCircle, RefreshCw } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogTitle,
		DialogDescription,
		DialogHeader,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Slider } from '$lib/components/ui/slider';
	import { toast } from 'svelte-sonner';
	import { createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { uploadFileWithProgress, fileToBase64, formatBytes } from '$lib/api';
	import type { Bucket } from '$lib/types';

	const MAX_SIZE = 4 * 1024 * 1024;
	const RESIZABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

	type BrowserCapabilities = {
		upload: boolean;
		canvasResize: boolean;
		png: boolean;
		jpeg: boolean;
		webp: boolean;
	};

	let { bucket }: { bucket: Bucket } = $props();

	const queryClient = useQueryClient();
	let capabilities = $state<BrowserCapabilities>({
		upload: false,
		canvasResize: false,
		png: false,
		jpeg: false,
		webp: false
	});

	let fileInputRef = $state<HTMLInputElement | null>(null);
	let isDialogOpen = $state(false);

	let originalFile = $state<File | null>(null);
	let targetFormat = $state<'original' | 'image/jpeg' | 'image/webp'>('original');
	let qualityValue = $state(80); // Slider uses number
	let quality = $derived(qualityValue / 100);
	let convertedFile = $state<File | null>(null);

	let showConverted = $state(true); // Switch for before/after
	let isConverting = $state(false);

	let uploadProgress = $state<number | null>(null);

	let originalWidth = $state<number>(0);
	let originalHeight = $state<number>(0);
	let targetWidth = $state<number>(0);
	let targetHeight = $state<number>(0);

	let isResizableFormat = $derived(
		originalFile ? RESIZABLE_IMAGE_TYPES.has(originalFile.type) : false
	);
	let canResizeOriginal = $derived(
		capabilities.canvasResize &&
			(originalFile?.type === 'image/png'
				? capabilities.png
				: originalFile?.type === 'image/jpeg'
					? capabilities.jpeg
					: originalFile?.type === 'image/webp'
						? capabilities.webp
						: false)
	);
	let canConvertToWebp = $derived(
		capabilities.canvasResize &&
			capabilities.webp &&
			(originalFile?.type === 'image/png' || originalFile?.type === 'image/jpeg')
	);
	let canConvertToJpeg = $derived(
		capabilities.canvasResize && capabilities.jpeg && originalFile?.type === 'image/png'
	);
	let canResize = $derived(
		isResizableFormat &&
			(targetFormat === 'original'
				? canResizeOriginal
				: targetFormat === 'image/webp'
					? canConvertToWebp
					: canConvertToJpeg)
	);
	let canConvertToTarget = $derived(
		targetFormat === 'original' ||
			(targetFormat === 'image/webp' ? canConvertToWebp : canConvertToJpeg)
	);
	let isResized = $derived(
		canResize && (targetWidth !== originalWidth || targetHeight !== originalHeight)
	);

	const activeFile = $derived(
		showConverted && convertedFile && (targetFormat !== 'original' || isResized)
			? convertedFile
			: originalFile
	);

	// Create object URLs for images to avoid memory leaks
	let originalUrl = $state('');
	let convertedUrl = $state('');

	function supportsCanvasFormat(canvas: HTMLCanvasElement, mimeType: string): boolean {
		try {
			return canvas.toDataURL(mimeType).toLowerCase().startsWith(`data:${mimeType}`);
		} catch {
			return false;
		}
	}

	// Browser-only feature detection. Keep unsupported controls disabled instead of failing later.
	onMount(() => {
		const canReadFiles =
			typeof File !== 'undefined' &&
			typeof FileReader !== 'undefined' &&
			typeof FileReader.prototype.readAsDataURL === 'function';
		const canCreateObjectUrls =
			typeof URL !== 'undefined' &&
			typeof URL.createObjectURL === 'function' &&
			typeof URL.revokeObjectURL === 'function';
		let canTrackUpload = false;

		try {
			const xhr = new XMLHttpRequest();
			canTrackUpload =
				'upload' in xhr && typeof xhr.open === 'function' && typeof xhr.send === 'function';
		} catch {
			// Keep upload disabled when the browser cannot construct XHR.
		}

		capabilities.upload =
			canReadFiles && canCreateObjectUrls && canTrackUpload && typeof Image === 'function';

		try {
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			const canUseCanvas =
				typeof HTMLCanvasElement !== 'undefined' &&
				typeof HTMLCanvasElement.prototype.toBlob === 'function' &&
				typeof HTMLCanvasElement.prototype.toDataURL === 'function' &&
				context !== null &&
				typeof context.drawImage === 'function';

			capabilities.canvasResize = canUseCanvas && typeof Image === 'function';
			if (capabilities.canvasResize) {
				capabilities.png = supportsCanvasFormat(canvas, 'image/png');
				capabilities.jpeg = supportsCanvasFormat(canvas, 'image/jpeg');
				capabilities.webp = supportsCanvasFormat(canvas, 'image/webp');
			}
		} catch {
			capabilities.canvasResize = false;
		}
	});

	$effect(() => {
		if (originalFile) {
			const url = URL.createObjectURL(originalFile);
			originalUrl = url;
			return () => URL.revokeObjectURL(url);
		} else {
			originalUrl = '';
		}
	});

	$effect(() => {
		if (convertedFile) {
			const url = URL.createObjectURL(convertedFile);
			convertedUrl = url;
			return () => URL.revokeObjectURL(url);
		} else {
			convertedUrl = '';
		}
	});

	// Reset state when dialog closes
	$effect(() => {
		if (!isDialogOpen && !uploadMutation.isPending) {
			originalFile = null;
			convertedFile = null;
			targetFormat = 'original';
			qualityValue = 80;
			originalWidth = 0;
			originalHeight = 0;
			targetWidth = 0;
			targetHeight = 0;
			isConverting = false;
			if (fileInputRef) fileInputRef.value = '';
		}
	});

	$effect(() => {
		const currentFile = originalFile;
		const currentFormat = targetFormat;
		const currentQuality = quality;
		const w = targetWidth;
		const h = targetHeight;
		const isCurrentlyResized = canResize && (w !== originalWidth || h !== originalHeight);

		if (
			!currentFile ||
			!canResize ||
			w < 16 ||
			h < 16 ||
			(currentFormat === 'original' && !isCurrentlyResized)
		) {
			convertedFile = null;
			isConverting = false;
			return;
		}

		let isCancelled = false;
		isConverting = true;

		const doConvert = async () => {
			if (isCancelled) return;

			let objectUrl: string | null = null;
			try {
				const img = new Image();
				objectUrl = URL.createObjectURL(currentFile);

				await new Promise((resolve, reject) => {
					img.onload = resolve;
					img.onerror = reject;
					img.src = objectUrl!;
				});

				if (isCancelled) return;

				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				if (ctx) {
					// Fill white background for png to jpeg conversion
					if (currentFormat === 'image/jpeg' && currentFile.type === 'image/png') {
						ctx.fillStyle = '#FFFFFF';
						ctx.fillRect(0, 0, canvas.width, canvas.height);
					}
					ctx.drawImage(img, 0, 0, w, h);
				}

				const finalFormat = currentFormat === 'original' ? currentFile.type : currentFormat;
				const blob = await new Promise<Blob | null>((resolve) => {
					canvas.toBlob(resolve, finalFormat, currentQuality);
				});

				if (isCancelled) return;

				if (blob) {
					const outputMimeType = blob.type || finalFormat;
					let ext = '';
					if (outputMimeType === 'image/webp') ext = 'webp';
					else if (outputMimeType === 'image/jpeg') ext = 'jpg';
					else if (outputMimeType === 'image/png') ext = 'png';
					else ext = currentFile.name.split('.').pop() || 'png';

					const nameWithoutExt =
						currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || currentFile.name;
					const newName = `${nameWithoutExt}${isCurrentlyResized ? '_resized' : ''}.${ext}`;
					convertedFile = new File([blob], newName, { type: outputMimeType });
					showConverted = true; // Auto switch to show converted
				}
			} catch (err) {
				console.error('Image conversion failed', err);
			} finally {
				if (objectUrl) URL.revokeObjectURL(objectUrl);
				if (!isCancelled) {
					isConverting = false;
				}
			}
		};

		// Debounce conversion slightly to prevent lag when dragging slider
		const timer = setTimeout(doConvert, 600);

		return () => {
			isCancelled = true;
			clearTimeout(timer);
		};
	});

	const uploadMutation = createMutation(() => ({
		mutationFn: async (file: File) => {
			const base64 = await fileToBase64(file);
			return uploadFileWithProgress(bucket.id, file, base64, (progress) => {
				uploadProgress = progress;
			});
		},
		onSuccess: () => {
			toast.success('File uploaded successfully');
			queryClient.invalidateQueries({ queryKey: ['buckets', bucket.id] });
			queryClient.invalidateQueries({ queryKey: ['buckets', bucket.id, 'files'] });
			isDialogOpen = false;
		},
		onError: (error: Error) => {
			toast.error(error.message || 'Upload failed');
		},
		onSettled: () => {
			uploadProgress = null;
		}
	}));

	function handleWidthChange(e: Event) {
		if (!canResize) return;

		const target = e.currentTarget as HTMLInputElement;
		const w = target.valueAsNumber;
		if (w && originalWidth && originalHeight) {
			const ratio = originalHeight / originalWidth;
			targetHeight = Math.round(w * ratio);
		}
	}

	function handleHeightChange(e: Event) {
		if (!canResize) return;

		const target = e.currentTarget as HTMLInputElement;
		const h = target.valueAsNumber;
		if (h && originalWidth && originalHeight) {
			const ratio = originalWidth / originalHeight;
			targetWidth = Math.round(h * ratio);
		}
	}

	function handleFileSelect(e: Event) {
		if (!capabilities.upload) {
			toast.error('This browser does not support file uploads');
			return;
		}

		const target = e.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;

		const file = target.files[0];
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			originalWidth = img.width;
			originalHeight = img.height;
			targetWidth = img.width;
			targetHeight = img.height;

			originalFile = file;
			targetFormat = 'original';
			qualityValue = 80;
			isDialogOpen = true;

			URL.revokeObjectURL(url);
		};
		img.onerror = () => {
			toast.error('Failed to read image dimensions');
			URL.revokeObjectURL(url);
		};
		img.src = url;
	}

	function handleUpload() {
		if (!activeFile || !capabilities.upload || !canConvertToTarget) return;
		if (activeFile.size > MAX_SIZE) {
			toast.error('File size exceeds 4MB limit');
			return;
		}
		uploadMutation.mutate(activeFile);
	}
</script>

<div>
	<input
		type="file"
		accept="image/*"
		class="hidden"
		bind:this={fileInputRef}
		onchange={handleFileSelect}
		disabled={!capabilities.upload || uploadMutation.isPending || bucket.status === 'full'}
	/>
	<Button
		onclick={() => fileInputRef?.click()}
		disabled={!capabilities.upload || uploadMutation.isPending || bucket.status === 'full'}
		size="lg"
	>
		{#if uploadMutation.isPending}
			<LoaderCircle size={16} class="mr-2 animate-spin" />
			Uploading...
		{:else if bucket.status === 'full'}
			Vault is Full
		{:else}
			<Upload size={16} class="mr-2" />
			Upload Image
		{/if}
	</Button>

	<Dialog bind:open={isDialogOpen}>
		<DialogContent class="sm:max-w-xl">
			<DialogHeader>
				<DialogTitle>Preview & Convert</DialogTitle>
				<DialogDescription class="sr-only"
					>Adjust format and quality before uploading.</DialogDescription
				>
			</DialogHeader>

			{#if originalFile}
				<div class="space-y-6">
					<div
						class="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/20 p-1"
					>
						<div
							class="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-md bg-muted"
						>
							{#if isConverting}
								<div
									class="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm"
								>
									<RefreshCw class="animate-spin text-primary" size={24} />
								</div>
							{/if}

							{#if showConverted && convertedUrl && (targetFormat !== 'original' || isResized)}
								<img
									src={convertedUrl}
									alt="Preview"
									class="max-h-full max-w-full object-contain"
								/>
							{:else}
								<img src={originalUrl} alt="Preview" class="max-h-full max-w-full object-contain" />
							{/if}
						</div>

						<div class="flex w-full items-center justify-between text-sm">
							<div>
								{#if (targetFormat !== 'original' || isResized) && convertedFile}
									<div class="flex items-center gap-2">
										<span class="text-xs font-semibold tracking-wide uppercase">Original</span>
										<Switch id="show-converted-switch" bind:checked={showConverted} />
										<span class="text-xs font-semibold tracking-wide uppercase">Converted</span>
									</div>
								{/if}
							</div>
							<div class="flex items-center gap-4 text-muted-foreground">
								<span>
									{#if activeFile === convertedFile}
										{targetWidth} &times; {targetHeight}
									{:else}
										{originalWidth} &times; {originalHeight}
									{/if}
								</span>
								<span
									class={activeFile && activeFile.size > MAX_SIZE
										? 'font-bold text-destructive'
										: 'font-medium'}
								>
									{activeFile ? formatBytes(activeFile.size) : ''}
								</span>
							</div>
						</div>
					</div>

					<div class="space-y-4">
						{#if isResizableFormat}
							<div class="flex items-center gap-4">
								<div class="space-y-2">
									<Label>Width (px)</Label>
									<Input
										type="number"
										min="16"
										bind:value={targetWidth}
										oninput={handleWidthChange}
										disabled={!canResize || uploadMutation.isPending}
									/>
								</div>
								<div class="space-y-2">
									<Label>Height (px)</Label>
									<Input
										type="number"
										min="16"
										bind:value={targetHeight}
										oninput={handleHeightChange}
										disabled={!canResize || uploadMutation.isPending}
									/>
								</div>
							</div>
						{/if}

						{#if originalFile.type === 'image/png' || originalFile.type === 'image/jpeg'}
							<div class="space-y-2">
								<Label>Format</Label>
								<RadioGroup bind:value={targetFormat} class="flex gap-4">
									<div class="flex items-center space-x-2">
										<RadioGroupItem
											value="original"
											id="fmt-original"
											disabled={uploadMutation.isPending}
										/>
										<Label for="fmt-original">Original</Label>
									</div>
									{#if originalFile.type === 'image/png' || originalFile.type === 'image/jpeg'}
										<div class="flex items-center space-x-2">
											<RadioGroupItem
												value="image/webp"
												id="fmt-webp"
												disabled={!canConvertToWebp || uploadMutation.isPending}
											/>
											<Label for="fmt-webp">WEBP</Label>
										</div>
									{/if}
									{#if originalFile.type === 'image/png'}
										<div class="flex items-center space-x-2">
											<RadioGroupItem
												value="image/jpeg"
												id="fmt-jpg"
												disabled={!canConvertToJpeg || uploadMutation.isPending}
											/>
											<Label for="fmt-jpg">JPG</Label>
										</div>
									{/if}
								</RadioGroup>
							</div>
						{/if}

						{#if targetFormat !== 'original'}
							<div class="space-y-3">
								<div class="flex items-center justify-between">
									<Label>Quality: {qualityValue}%</Label>
								</div>
								<Slider
									type="single"
									bind:value={qualityValue}
									max={100}
									min={10}
									step={1}
									disabled={!canConvertToTarget || uploadMutation.isPending}
									class="w-full"
								/>
							</div>
						{/if}
					</div>
				</div>

				<DialogFooter class="sm:justify-between">
					<div>
						{#if activeFile && activeFile.size > MAX_SIZE}
							<p class="text-sm font-medium text-destructive">File exceeds 4MB limit.</p>
						{/if}
					</div>
					<div class="flex gap-2">
						<Button
							variant="outline"
							onclick={() => (isDialogOpen = false)}
							disabled={uploadMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onclick={handleUpload}
							disabled={uploadMutation.isPending ||
								!activeFile ||
								!capabilities.upload ||
								!canConvertToTarget ||
								activeFile.size > MAX_SIZE ||
								isConverting ||
								(canResize && (targetWidth < 16 || targetHeight < 16))}
						>
							{#if uploadMutation.isPending}
								<LoaderCircle size={16} class="mr-2 animate-spin" />
								{uploadProgress !== null ? `${uploadProgress}%` : 'Uploading...'}
							{:else}
								Upload {targetFormat !== 'original' || isResized ? 'Converted' : ''}
							{/if}
						</Button>
					</div>
				</DialogFooter>
			{/if}
		</DialogContent>
	</Dialog>
</div>
