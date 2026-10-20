// Server-only contracts. Never import this directory from src/.
export class ProviderUnavailable extends Error { constructor(message='Printing is not connected. No order was submitted.'){super(message);this.code='PROVIDER_UNAVAILABLE';} }
export class PrintProvider {
 async formats(){throw new ProviderUnavailable();}
 async quote(){throw new ProviderUnavailable();}
 async coverDimensions(){throw new ProviderUnavailable();}
 async validateInterior(){throw new ProviderUnavailable();}
 async validateCover(){throw new ProviderUnavailable();}
 async submit(){throw new ProviderUnavailable();}
 async status(){throw new ProviderUnavailable();}
}
export class PreviewProvider extends PrintProvider {
 async formats(){return {mode:'preview',formats:[],reason:'No connected printer; no products or prices are verified.'};}
}
