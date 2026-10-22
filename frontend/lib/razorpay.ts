// Razorpay checkout loader shared by pages that take a payment. Typed locally so it does not clash with other declarations.

export type RazorpayResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill?: { name?: string; email?: string; contact?: string }
  theme?: { color: string }
  modal?: { ondismiss: () => void }
  handler: (response: RazorpayResponse) => void
}

type RazorpayConstructor = new (options: RazorpayOptions) => { open(): void }

export function loadRazorpay(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve((window as unknown as { Razorpay: RazorpayConstructor }).Razorpay)
    script.onerror = () => reject(new Error('Failed to load Razorpay script'))
    document.body.appendChild(script)
  })
}
